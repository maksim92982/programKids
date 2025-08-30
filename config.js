module.exports = {
    // Конфигурация сервера
    server: {
        port: process.env.PORT || 8080,
        host: process.env.HOST || '0.0.0.0'
    },

    // Конфигурация базы данных
    database: {
        path: process.env.DB_PATH || './database.sqlite',
        timeout: 30000
    },

    // Конфигурация магазина для самозанятые.рф
    shop: {
        apiKey: process.env.SELFWORK_API_KEY || 'UxYjU5ZDMxOGU1ZmFjYzE3',
        origin: process.env.SHOP_ORIGIN || 'https://program-kids.vercel.app/',
        referer: process.env.SHOP_REFERER || 'program-kids.vercel.app',
        // Белые IP Сам.Эквайринга
        allowedIPs: ['178.205.169.35', '81.23.144.157']
    },

    // Конфигурация Vimeo
    vimeo: {
        clientId: process.env.VIMEO_CLIENT_ID || '',
        clientSecret: process.env.VIMEO_CLIENT_SECRET || '',
        accessToken: process.env.VIMEO_ACCESS_TOKEN || ''
    },

    // Конфигурация безопасности
    security: {
        sessionSecret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
        bcryptRounds: 10
    },

    // Конфигурация логирования
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        file: process.env.LOG_FILE || './logs/app.log'
    }
};

