// npm i express axios body-parser crypto cors sqlite3
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const cors = require('cors');
const Database = require('./database');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// === Конфиг магазина ===
const SHOP = {
  apiKey: process.env.SELFWORK_API_KEY || 'lJQHoFADBvSC8KedJf511nufkhg592ud',
  origin: process.env.SHOP_ORIGIN || 'https://test-shop.ru/',
  referer: process.env.SHOP_REFERER || 'test-shop.ru',
  // Белые IP Сам.Эквайринга:
  ipAllow: new Set(['178.205.169.35', '81.23.144.157'])
};

// Инициализация базы данных
const db = new Database();

// Получение цены модуля из базы данных
async function getModulePrice(module) {
  const content = await db.get('SELECT price FROM content WHERE module = ?', [module]);
  return content ? content.price : 3000; // RUB по умолчанию
}

async function calcFinalPriceRUB({ module, promoCode, bonuses }) {
  const base = await getModulePrice(module);
  const promo = promoCode ? 500 : 0;
  const useBonus = Math.min(bonuses || 0, Math.max(base - promo, 0));
  return Math.max(base - promo - useBonus, 0);
}

// Вспомогалка подписи
function sha256hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

// Вспомогательная функция для генерации пароля
function generatePassword() {
  const length = 8;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// === Маршруты ===

// Статические файлы
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/payment-result.html', (req, res) => {
  res.sendFile(__dirname + '/payment-result.html');
});

// Создание платежа (ДОБАВЛЕНО)
app.post('/api/create-payment', async (req, res) => {
  try {
    const { email, module, promoCode, bonuses, returnUrl } = req.body;

    // 1. Валидация данных
    if (!email || !module) {
      return res.status(400).json({ error: 'Email и модуль обязательны' });
    }

    // 2. Расчет итоговой цены
    const finalPrice = await calcFinalPriceRUB({ module, promoCode, bonuses });

    // 3. Создание заказа в базе данных
const orderId = await db.createOrder({
    email,
    module,
    amountRUB: finalPrice,
    bonuses: bonuses || 0,
    promoCode: promoCode || null,
    status: 'pending'
});

    // 4. Подготовка данных для Сам.Эквайринга
    const orderData = {
      order_id: orderId,
      amount: finalPrice,
      currency: 'RUB',
      client_email: email,
      return_url: returnUrl,
      // Другие необходимые параметры согласно документации Сам.Эквайринга
    };

    // 5. Генерация подписи
    const signatureData = `${orderData.order_id}${orderData.amount}${SHOP.apiKey}`;
    orderData.signature = sha256hex(signatureData);

    // 6. Отправка формы в Сам.Эквайринг
    const paymentFormHtml = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <title>Перенаправление на оплату...</title>
      </head>
      <body>
          <form id="paymentForm" action="https://3dsec.sberbank.ru/payment/merchants/test/payment_ru.html" method="POST">
              <input type="hidden" name="order_id" value="${orderData.order_id}">
              <input type="hidden" name="amount" value="${orderData.amount}">
              <input type="hidden" name="currency" value="${orderData.currency}">
              <input type="hidden" name="client_email" value="${orderData.client_email}">
              <input type="hidden" name="return_url" value="${orderData.return_url}">
              <input type="hidden" name="signature" value="${orderData.signature}">
          </form>
          <script>
              document.getElementById('paymentForm').submit();
          </script>
      </body>
      </html>
    `;

    // 7. Отправляем HTML с формой оплаты
    res.json({
      orderId: orderId,
      paymentPageHtml: paymentFormHtml
    });

  } catch (error) {
    console.error('Ошибка создания платежа:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Вебхук от Сам.Эквайринга
app.post('/api/callback', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    
    const data = req.body;
    const { order_id, status, amount, signature } = data || {};
    if (!order_id || !amount || !signature) return res.status(400).end();

    // Проверяем подпись уведомления
    const calc = sha256hex(`${order_id}${amount}${SHOP.apiKey}`);
    if (calc !== signature) {
      console.warn('Bad signature for', order_id);
      return res.status(400).end();
    }

    // Получаем заказ из базы данных
    const order = await db.getOrder(order_id);
    if (!order) {
      console.warn('Заказ не найден:', order_id);
      return res.status(400).end();
    }

    if (status === 'succeeded') {
      // Обновляем статус заказа
      await db.updateOrderStatus(order_id, 'succeeded');
      
      // Если есть промокод, отмечаем его как использованный
      if (order.promoCode) {
        await db.usePromoCode(order.promoCode, order.email);
      }
      
      // Создаем пользователя, если его нет
      let user = await db.getUserByEmail(order.email);
      if (!user) {
        const password = generatePassword();
        const result = await db.createUser(order.email, password);
        user = await db.getUserById(result.userId);
      }
      
      // Открываем доступ к модулю
      await db.addUserModule(user.id, order.module);
      
      console.log(`Доступ к модулю ${order.module} открыт для ${order.email}`);
    } else {
      await db.updateOrderStatus(order_id, 'failed');
    }

    res.status(200).end();
  } catch (error) {
    console.error('Ошибка в вебхуке:', error);
    res.status(500).end();
  }
});

// Проверка статуса со стороны фронта
app.get('/api/order-status', async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.json({ status: 'unknown' });
    
    const order = await db.getOrder(id);
    if (!order) return res.json({ status: 'unknown' });
    
    return res.json({
      status: order.status,
      payload: {
        email: order.email,
        module: order.module,
        amountRUB: order.amountRUB,
        bonuses: order.bonuses,
        promoCode: order.promoCode
      }
    });
  } catch (error) {
    console.error('Ошибка проверки статуса:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// отдаем статику (index.html, payment-result.html и т.д.)
app.use(express.static('./'));

// API для работы с пользователями
app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const result = await db.createUser(email, password);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({ success: true, message: 'Пользователь зарегистрирован' });
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const user = await db.getUserByEmail(email);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Обновляем время последнего входа
    await db.updateUser(user.id, { lastLogin: new Date().toISOString() });

    res.json({ 
      success: true, 
      user: {
        id: user.id,
        email: user.email,
        referralCode: user.referralCode,
        bonusBalance: user.bonusBalance
      }
    });
  } catch (error) {
    console.error('Ошибка входа:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const admin = await db.checkAdmin(email, password);
    if (!admin) {
      return res.status(401).json({ error: 'Неверные данные администратора' });
    }

    res.json({ success: true, message: 'Вход выполнен успешно' });
  } catch (error) {
    console.error('Ошибка входа админа:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API для получения данных
app.get('/api/content', async (req, res) => {
  try {
    const content = await db.getAllContent();
    res.json(content);
  } catch (error) {
    console.error('Ошибка получения контента:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Ошибка получения пользователей:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/user/:id/modules', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const modules = await db.getUserModules(userId);
    res.json(modules);
  } catch (error) {
    console.error('Ошибка получения модулей пользователя:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API для администратора
app.post('/api/admin/content', async (req, res) => {
  try {
    const { module, title, videoUrl, videoType, price } = req.body;
    if (!module || !title || !videoUrl) {
      return res.status(400).json({ error: 'Не все обязательные поля заполнены' });
    }

    const result = await db.addContent({ module, title, videoUrl, videoType, price });
    res.json(result);
  } catch (error) {
    console.error('Ошибка добавления контента:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/content/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = req.body;
    
    await db.updateContent(id, updates);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка обновления контента:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/admin/content/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.deleteContent(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления контента:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Получен сигнал SIGINT, закрываем сервер...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Получен сигнал SIGTERM, закрываем сервер...');
  await db.close();
  process.exit(0);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log('Server started on ' + PORT));

