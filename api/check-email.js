// Проверка существования email в users.json (GitHub) для валидации перед оплатой

export default async function handler(req, res) {
  try {
    // CORS / preflight
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

    // Read body safe
    let body = req.body;
    if (!body || Object.keys(body).length === 0) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        const params = new URLSearchParams(raw || '');
        body = Object.fromEntries(params.entries());
      }
    }

    const email = String(body.email || '').trim().toLowerCase();
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // Try to read users.json from GitHub if configured
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO; // owner/repo
    const branch = process.env.GITHUB_BRANCH || 'main';
    let exists = false;
    if (token && repo) {
      try {
        const url = `https://api.github.com/repos/${repo}/contents/users.json?ref=${branch}`;
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
        });
        if (resp.ok) {
          const data = await resp.json();
          const content = Buffer.from(data.content, 'base64').toString('utf8');
          const usersObj = JSON.parse(content || '{}');
          exists = Boolean(usersObj[email]);
        } else if (resp.status === 404) {
          exists = false;
        } else {
          // If GitHub error, be conservative: allow registration (exists=false)
          exists = false;
        }
      } catch {
        exists = false;
      }
    } else {
      // No GitHub configured — treat as not exists
      exists = false;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ exists });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}


