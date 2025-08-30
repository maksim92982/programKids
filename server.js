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

// Создание платежа
app.post('/api/create-payment', async (req, res) => {
  try {
    const { email, module, promoCode, bonuses = 0, returnUrl } = req.body;
    if (!email || !module) return res.status(400).json({ error: 'email и module обязательны' });

    const amountRUB = await calcFinalPriceRUB({ module, promoCode, bonuses });
    const amountKopec = amountRUB * 100;

    const orderId = crypto.randomUUID(); // до 35 символов — ок
    
    // Сохраняем заказ в базу данных
    await db.createOrder(orderId, email, module, amountRUB, bonuses, promoCode);

    // Формируем поля info[0] — в чеке
    const info0 = {
      name: `Доступ к модулю ${module} (${email})`,
      quantity: 1,
      amount: amountKopec
    };

    // signature = sha256(order_id + amount + info[0].name + info[0].quantity + info[0].amount + api_key)
    const signBase =
      `${orderId}${amountKopec}${info0.name}${info0.quantity}${info0.amount}${SHOP.apiKey}`;
    const signature = sha256hex(signBase);

    // Собираем x-www-form-urlencoded
    const form = new URLSearchParams();
    form.append('order_id', orderId);
    form.append('amount', String(amountKopec));
    form.append('signature', signature);
    form.append('info[0][name]', info0.name);
    form.append('info[0][quantity]', String(info0.quantity));
    form.append('info[0][amount]', String(info0.amount));
    // Сам.Эквайринг вернёт на URL из настроек магазина; если поддерживает параметр — добавь:
    if (returnUrl) form.append('return_url', returnUrl); // если в их API такой параметр есть; иначе настрой в ЛК

    // Инициализация платежа (Сам.Эквайринг отдаёт HTML страницы оплаты)
    const resp = await axios.post('https://pro.selfwork.ru/merchant/v1/init', form, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': SHOP.origin,
        'Referer': SHOP.referer
      },
      // чтобы получить сырую HTML-страницу целиком:
      responseType: 'text',
      transformResponse: r => r
    });

    return res.json({ orderId, paymentPageHtml: resp.data });
  } catch (e) {
    console.error(e?.response?.data || e.message);
    return res.status(500).json({ error: 'init payment failed' });
  }
});

// Вебхук от Сам.Эквайринга
app.post('/api/callback', async (req, res) => {
  try {
    // Сам.Эквайринг шлёт JSON; в PHP это json_decode(file_get_contents('php://input'), true)
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    // при работе за прокси добавь реальную проверку
    // if (!SHOP.ipAllow.has(ip)) { return res.status(403).end(); }

    const data = req.body; // {order_id,status,amount,currency,..., signature}
    const { order_id, status, amount, signature } = data || {};
    if (!order_id || !amount || !signature) return res.status(400).end();

    // Проверяем подпись уведомления: sha256(order_id + amount + api_key)
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

    res.status(200).end(); // Сам.Эквайринг ждёт 200 OK
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

// отдаем статику (index.html, payment-result.html и т.д.)
app.use(express.static('./'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log('Server started on ' + PORT));

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
