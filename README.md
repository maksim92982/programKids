# Обучающая платформа с интеграцией платежей

Веб-приложение для продажи обучающих модулей с интеграцией платежной системы самозанятые.рф и Vimeo.

## 🚀 Возможности

- ✅ Пользовательская авторизация и регистрация
- ✅ Личный кабинет с доступом к купленным модулям
- ✅ Административная панель для управления контентом
- ✅ Интеграция с платежной системой самозанятые.рф
- ✅ Система промокодов и реферальных бонусов
- ✅ SQLite база данных для хранения данных
- ✅ API для работы с фронтендом
- ✅ Интеграция с Vimeo для видео контента

## 🏗️ Архитектура

### Фронтенд
- `index.html` - главная страница с авторизацией и личным кабинетом
- `payment-result.html` - страница результата оплаты

### Бэкенд
- `server.js` - основной сервер Express.js
- `database.js` - работа с SQLite базой данных
- `config.js` - конфигурация приложения

### База данных
- SQLite с таблицами: users, admins, content, user_modules, orders, promo_codes

## 📋 Требования

- Node.js 16+ 
- npm или yarn
- Доступ к серверу для размещения

## 🛠️ Установка и настройка

### 1. Клонирование и установка зависимостей

```bash
git clone <your-repo>
cd project
npm install
```

### 2. Настройка переменных окружения

Скопируйте `env.example` в `.env` и заполните:

```bash
cp env.example .env
```

Отредактируйте `.env` файл:

```env
# Конфигурация магазина для самозанятые.рф
SELFWORK_API_KEY=ваш_реальный_api_ключ
SHOP_ORIGIN=https://ваш-домен.com/
SHOP_REFERER=ваш-домен.com

# Конфигурация Vimeo (опционально)
VIMEO_CLIENT_ID=ваш_vimeo_client_id
VIMEO_CLIENT_SECRET=ваш_vimeo_client_secret
VIMEO_ACCESS_TOKEN=ваш_vimeo_access_token
```

### 3. Настройка самозанятые.рф

1. Зарегистрируйтесь на [самозанятые.рф](https://самозанятые.рф)
2. Получите API ключ в личном кабинете
3. Настройте redirect URL: `https://ваш-домен.com/payment-result.html`
4. Укажите webhook URL: `https://ваш-домен.com/api/callback`

### 4. Запуск в режиме разработки

```bash
npm start
```

Сервер запустится на `http://localhost:8080`

## 🌐 Развертывание на продакшн сервере

### Вариант 1: VPS/Выделенный сервер

1. **Подготовка сервера:**
   ```bash
   # Обновление системы
   sudo apt update && sudo apt upgrade -y
   
   # Установка Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Установка PM2 для управления процессами
   sudo npm install -g pm2
   ```

2. **Загрузка проекта:**
   ```bash
   git clone <your-repo>
   cd project
   npm install --production
   ```

3. **Настройка переменных окружения:**
   ```bash
   cp env.example .env
   # Отредактируйте .env с реальными значениями
   ```

4. **Запуск с PM2:**
   ```bash
   pm2 start server.js --name "learning-platform"
   pm2 startup
   pm2 save
   ```

5. **Настройка Nginx (опционально):**
   ```nginx
   server {
       listen 80;
       server_name ваш-домен.com;
       
       location / {
           proxy_pass http://localhost:8080;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### Вариант 2: Хостинг-провайдеры

#### Heroku
```bash
# Установка Heroku CLI
heroku create your-app-name
heroku config:set SELFWORK_API_KEY=ваш_ключ
heroku config:set SHOP_ORIGIN=https://ваш-домен.com/
git push heroku main
```

#### Railway
```bash
# Установка Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up
```

#### DigitalOcean App Platform
- Создайте новое приложение
- Подключите GitHub репозиторий
- Настройте переменные окружения
- Deploy

## 🔧 Настройка базы данных

База данных SQLite создается автоматически при первом запуске. Файл `database.sqlite` будет создан в корне проекта.

### Структура базы данных:

- **users** - пользователи системы
- **admins** - администраторы
- **content** - обучающие модули
- **user_modules** - доступы пользователей к модулям
- **orders** - заказы и платежи
- **promo_codes** - промокоды и реферальные коды

### Тестовые данные:

При первом запуске автоматически создаются:
- Админ: `admin@example.com` / `admin123`
- Тестовые модули A1 и A2

## 🔐 Безопасность

### Обязательные меры:

1. **Измените пароли по умолчанию**
2. **Настройте HTTPS** (SSL сертификат)
3. **Используйте сильные пароли** для API ключей
4. **Настройте firewall** на сервере
5. **Регулярно обновляйте зависимости**

### Рекомендуемые меры:

1. **Настройте rate limiting** для API
2. **Добавьте логирование** действий пользователей
3. **Настройте мониторинг** сервера
4. **Создайте резервные копии** базы данных

## 📱 Интеграция с Vimeo

### Настройка Vimeo API:

1. Создайте приложение на [Vimeo Developer](https://developer.vimeo.com/)
2. Получите Client ID, Client Secret и Access Token
3. Добавьте в `.env` файл

### Использование:

```javascript
// В админке добавьте ссылку на Vimeo видео
// Формат: https://vimeo.com/VIDEO_ID
// Система автоматически определит тип и создаст плеер
```

## 🧪 Тестирование

### Локальное тестирование:

```bash
# Запуск сервера
npm start

# Тестирование API
curl http://localhost:8080/api/content
curl http://localhost:8080/api/users
```

### Тестирование платежей:

1. Используйте тестовые данные от самозанятые.рф
2. Проверьте webhook на [webhook.site](https://webhook.site)
3. Тестируйте полный цикл покупки

## 📊 Мониторинг и логирование

### PM2 мониторинг:

```bash
pm2 monit
pm2 logs learning-platform
pm2 status
```

### Логи приложения:

Логи сохраняются в `./logs/app.log` (если настроено)

## 🔄 Обновление

```bash
git pull origin main
npm install
pm2 restart learning-platform
```

## 🆘 Устранение неполадок

### Частые проблемы:

1. **Ошибка подключения к БД:**
   - Проверьте права доступа к папке
   - Убедитесь, что SQLite установлен

2. **Ошибки платежей:**
   - Проверьте API ключ самозанятые.рф
   - Убедитесь в правильности webhook URL
   - Проверьте IP адреса в настройках

3. **Проблемы с Vimeo:**
   - Проверьте API ключи Vimeo
   - Убедитесь в доступности видео

### Логи для диагностики:

```bash
# Логи сервера
pm2 logs learning-platform --lines 100

# Логи Nginx (если используется)
sudo tail -f /var/log/nginx/error.log
```

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи сервера
2. Убедитесь в правильности настроек
3. Проверьте документацию самозанятые.рф
4. Создайте issue в репозитории

## 📄 Лицензия

ISC License

---

**Важно:** Не забудьте изменить все тестовые пароли и API ключи перед использованием в продакшене!
