module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    // Read body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    const body = raw ? JSON.parse(raw) : {};

    const email = String(body.email || '').trim();
    const moduleLabel = String(body.module || '').trim();
    const returnUrl = String(body.returnUrl || '/');
    const amount = Math.max(1, Math.min(300000, Number(body.amount || 3000)));

    const orderId = 'order_' + Math.random().toString(36).slice(2, 10);

    const paymentPageHtml = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Оплата</title>
<style>body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;background:#f6f7f9;color:#1f2d3d}
.wrap{max-width:720px;margin:40px auto;background:#fff;border-radius:10px;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden}
.head{padding:24px 28px;border-bottom:1px solid #eef0f3;font-size:18px;font-weight:600}
.content{padding:24px 28px}
.row{margin:10px 0}
.big{font-size:28px;font-weight:700}
.btn{display:inline-block;margin-top:18px;background:#635bff;color:#fff;border:none;border-radius:8px;padding:12px 18px;font-size:16px;cursor:pointer}
.muted{color:#6b7280;font-size:14px}
</style></head><body>
<div class="wrap">
  <div class="head">ProgramKids — Оплата</div>
  <div class="content">
    <div class="row">Заказ <b>${orderId}</b></div>
    <div class="row">Покупатель: <span class="muted">${email || '—'}</span></div>
    <div class="row">Товар: <b>${moduleLabel || 'Модуль'}</b></div>
    <div class="row big">К оплате: ${amount.toLocaleString('ru-RU')} ₽</div>
    <button class="btn" onclick="location.href='${returnUrl}?status=success&orderId=${orderId}'">Оплатить (демо)</button>
    <div class="row muted">Это демо‑страница оплаты без списания средств.</div>
  </div>
</div>
</body></html>`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).end(JSON.stringify({ orderId, paymentPageHtml }));
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};


