# 🚀 Развертывание на Vercel

## 📋 Что нужно сделать

### 1. Подготовить GitHub репозиторий

**Файлы для загрузки в GitHub:**
```
✅ index.html
✅ payment-result.html
✅ server.js
✅ database.js
✅ config.js
✅ package.json
✅ package-lock.json
✅ vercel.json
✅ .gitignore
✅ README.md
✅ DEPLOYMENT.md
✅ ANSWERS.md
```

**Файлы НЕ загружать в GitHub:**
```
❌ node_modules/ (создается автоматически)
❌ database.sqlite (создается автоматически)
❌ .env (переменные окружения)
❌ logs/ (логи)
```

### 2. Создать GitHub репозиторий

```bash
# Инициализация Git
git init
git add .
git commit -m "Initial commit: Learning platform with payments"

# Создать репозиторий на GitHub и подключить
git remote add origin https://github.com/ваш-username/ваш-репозиторий.git
git branch -M main
git push -u origin main
```

### 3. Настроить Vercel

1. **Зарегистрируйтесь на [vercel.com](https://vercel.com)**
2. **Подключите GitHub аккаунт**
3. **Импортируйте ваш репозиторий**
4. **Настройте переменные окружения**

## 🔧 Настройка переменных окружения в Vercel

В настройках проекта Vercel добавьте:

```env
SELFWORK_API_KEY=lJQHoFADBvSC8KedJf511nufkhg592ud
SHOP_ORIGIN=https://test-shop.ru/
SHOP_REFERER=test-shop.ru
NODE_ENV=production
```

## 🌐 Настройка домена

### 1. В Vercel:
- Перейдите в настройки проекта
- Выберите "Domains"
- Добавьте ваш домен с reg.ru

### 2. В reg.ru:
- Настройте DNS записи:
  ```
  Type: CNAME
  Name: @
  Value: cname.vercel-dns.com
  ```

## 📱 Настройка самозанятые.рф

### Обновите настройки в личном кабинете:

**Редирект:** `https://ваш-домен.com/payment-result.html`
**Callback:** `https://ваш-домен.com/api/callback`

## 🚀 Развертывание

1. **Загрузите код в GitHub**
2. **Подключите репозиторий к Vercel**
3. **Настройте переменные окружения**
4. **Добавьте домен**
5. **Deploy!**

## ✅ Проверка работы

После развертывания проверьте:

1. **Главная страница** открывается
2. **Авторизация** работает
3. **Админка** доступна (`admin@example.com` / `admin123`)
4. **Покупка модуля** работает
5. **Webhook** получает уведомления

## 🆘 Если что-то не работает

### Проверьте логи в Vercel:
- Dashboard → Ваш проект → Functions → server.js → View Function Logs

### Частые проблемы:
1. **Ошибки в переменных окружения**
2. **Неправильные URL в самозанятые.рф**
3. **Проблемы с CORS**
4. **Ошибки в базе данных**

## 📞 Поддержка

При проблемах:
1. Проверьте логи Vercel
2. Убедитесь в правильности настроек
3. Проверьте переменные окружения
4. Убедитесь, что домен правильно настроен

---

**Готово! Ваш сайт будет доступен по адресу: `https://ваш-домен.com`**
