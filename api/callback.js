// Callback от Самозанятый.рф: payment.succeeded
// Действия:
// - создаём/обновляем пользователя по email
// - добавляем доступ к модулю
// - отправляем письмо с логином/паролем
// - при наличии GITHUB_TOKEN, сохраняем в users.json в GitHub

import crypto from 'crypto';

async function sendEmail({ to, subject, html }) {
  const nodemailer = await import('nodemailer');
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM || `ProgramKids <${user}>`;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({ from, to, subject, html });
}

async function getUsersFromGithub() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // owner/repo
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token || !repo) return { users: {}, sha: null };

  const url = `https://api.github.com/repos/${repo}/contents/users.json?ref=${branch}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
  if (resp.status === 404) return { users: {}, sha: null };
  if (!resp.ok) throw new Error('GitHub read users.json failed');
  const data = await resp.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { users: JSON.parse(content || '{}'), sha: data.sha };
}

async function saveUsersToGithub(users, sha) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // owner/repo
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token || !repo) return;
  const url = `https://api.github.com/repos/${repo}/contents/users.json`;
  const content = Buffer.from(JSON.stringify(users, null, 2), 'utf8').toString('base64');
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({
      message: 'Update users.json (callback)',
      content,
      sha: sha || undefined,
      branch,
    }),
  });
  if (!resp.ok) throw new Error('GitHub write users.json failed');
}

function generatePassword() {
  return crypto.randomBytes(6).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
}

function hashPassword(plain) {
  // Простой sha256-хеш (для демо). В бою лучше bcrypt/argon2.
  return crypto.createHash('sha256').update(plain).digest('hex');
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.status(200).end();
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    let body = req.body;
    if (!body) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (ct.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(raw);
        body = Object.fromEntries(params.entries());
      } else if (raw && (ct.includes('application/json') || raw.trim().startsWith('{'))) {
        body = JSON.parse(raw);
      } else {
        body = {};
      }
    }

    // Ожидаем поля от Самозанятый.рф. Минимум нам нужны email и название товара/module
    const email = String(body.email || body.customer_email || body.payer_email || '').trim().toLowerCase();
    const moduleLabel = String(body.module || body['info[0][name]'] || body.item || body.title || '').trim();
    const orderId = String(body.order_id || body.orderId || '').trim();

    if (!email || !moduleLabel) {
      res.status(400).json({ error: 'Missing email or module in callback' });
      return;
    }

    // 1) Читаем текущих пользователей из GitHub (если настроено)
    const { users, sha } = await getUsersFromGithub();

    // 2) Создаём/обновляем пользователя
    const existing = users[email];
    let passwordPlain = null;
    if (!existing) {
      passwordPlain = generatePassword();
      users[email] = {
        email,
        passwordHash: hashPassword(passwordPlain),
        modules: [],
        createdAt: new Date().toISOString(),
      };
    }
    const set = new Set(users[email].modules || []);
    set.add(moduleLabel);
    users[email].modules = Array.from(set);
    users[email].updatedAt = new Date().toISOString();

    // 3) Сохраняем в GitHub (если токен сконфигурирован)
    try { await saveUsersToGithub(users, sha); } catch (e) { console.error('saveUsersToGithub', e); }

    // 4) Письмо пользователю
    const siteUrl = 'https://program-kids.vercel.app';
    const login = email;
    const passwordInfo = passwordPlain ? `Пароль: <b>${passwordPlain}</b>` : 'Пароль — как при предыдущем входе';
    await sendEmail({
      to: email,
      subject: `Доступ к модулю «${moduleLabel}» открыт`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222">
          <p>Здравствуйте!</p>
          <p>Оплата по заказу <b>${orderId || ''}</b> получена. Доступ к модулю <b>${moduleLabel}</b> открыт.</p>
          <p>Логин (email): <b>${login}</b><br/>${passwordInfo}</p>
          <p>Войти можно по ссылке: <a href="${siteUrl}#auth">${siteUrl}</a></p>
          <hr/>
          <p style="color:#666">Если письмо пришло по ошибке — просто проигнорируйте его.</p>
        </div>
      `,
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}


