// Реальная интеграция с Самозанятый.рф (pro.selfwork.ru)
// Окружение: задайте эти переменные в Vercel → Project Settings → Environment Variables
const PAYMENT_URL = process.env.SELFWORK_PAYMENT_URL || 'https://pro.selfwork.ru/merchant/v1/init';
const API_KEY = process.env.SELFWORK_API_KEY || '4l5FOug3YpfAx54yfnXA7Rvomeylyjlk';

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    const body = raw ? JSON.parse(raw) : {};

    const email = String(body.email || '').trim();
    const moduleLabel = String(body.module || '').trim();
    const returnUrl = String(body.returnUrl || '/');
    const promoCode = String(body.promoCode || '').trim();
    let amount = Number(body.amount || 3000);
    if (promoCode.toUpperCase() === 'TEST10' || moduleLabel.toUpperCase() === 'TEST10') {
      amount = 10;
    }
    amount = Math.max(1, Math.min(300000, amount));

    const orderId = 'order_' + Math.random().toString(36).slice(2, 10);

    // Формируем параметры (x-www-form-urlencoded)
    const params = new URLSearchParams();
    params.append('order_id', orderId);
    params.append('amount', String(amount * 100));
    params.append('info[0][name]', moduleLabel || 'Модуль');
    params.append('info[0][quantity]', '1');
    params.append('info[0][amount]', String(amount * 100));

    // Подпись: sha256(order_id + amountKop + name + quantity + amountKop + apiKey)
    const dataToSign = orderId + String(amount * 100) + (moduleLabel || 'Модуль') + '1' + String(amount * 100) + API_KEY;
    const signature = require('crypto').createHash('sha256').update(dataToSign).digest('hex');
    params.append('signature', signature);

    // Отправка на шлюз
    const resp = await fetch(PAYMENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': new URL(returnUrl).origin,
        'Referer': new URL(returnUrl).host
      },
      body: params.toString()
    });

    const html = await resp.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).end(JSON.stringify({ orderId, paymentPageHtml: html }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};


