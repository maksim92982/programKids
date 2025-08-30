const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        // Для Vercel используем временную БД в памяти
        if (process.env.NODE_ENV === 'production' && process.env.VERCEL) {
            this.dbPath = ':memory:';
        } else {
            this.dbPath = path.join(__dirname, 'database.sqlite');
        }
        this.db = null;
        this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Ошибка открытия базы данных:', err);
                    reject(err);
                    return;
                }
                console.log('База данных подключена');
                this.createTables().then(resolve).catch(reject);
            });
        });
    }

    async createTables() {
        const queries = [
            // Таблица пользователей
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                referralCode TEXT UNIQUE,
                bonusBalance INTEGER DEFAULT 0,
                lastLogin TEXT,
                usedPromoCode BOOLEAN DEFAULT 0,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP
            )`,

            // Таблица администраторов
            `CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP
            )`,

            // Таблица контента (модулей)
            `CREATE TABLE IF NOT EXISTS content (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                module TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                videoUrl TEXT,
                videoType TEXT DEFAULT 'vimeo',
                price INTEGER DEFAULT 3000,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP
            )`,

            // Таблица доступов пользователей к модулям
            `CREATE TABLE IF NOT EXISTS user_modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER NOT NULL,
                module TEXT NOT NULL,
                purchasedAt TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users (id),
                UNIQUE(userId, module)
            )`,

            // Таблица заказов
            `CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                module TEXT NOT NULL,
                amountRUB INTEGER NOT NULL,
                bonuses INTEGER DEFAULT 0,
                promoCode TEXT,
                status TEXT DEFAULT 'pending',
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
            )`,

            // Таблица промокодов (реферальных кодов)
            `CREATE TABLE IF NOT EXISTS promo_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                userId INTEGER NOT NULL,
                usedBy TEXT,
                usedAt TEXT,
                FOREIGN KEY (userId) REFERENCES users (id)
            )`
        ];

        for (const query of queries) {
            await this.run(query);
        }

        // Создаем индексы для оптимизации
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            'CREATE INDEX IF NOT EXISTS idx_user_modules_userid ON user_modules(userId)',
            'CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email)',
            'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)'
        ];

        for (const index of indexes) {
            await this.run(index);
        }

        // Добавляем тестового админа, если его нет
        await this.addDefaultAdmin();
        
        // Добавляем тестовый контент, если его нет
        await this.addDefaultContent();
    }

    async addDefaultAdmin() {
        const adminExists = await this.get('SELECT COUNT(*) as count FROM admins WHERE email = ?', ['admin@example.com']);
        if (adminExists.count === 0) {
            await this.run(
                'INSERT INTO admins (email, password) VALUES (?, ?)',
                ['admin@example.com', 'admin123']
            );
            console.log('Создан тестовый админ: admin@example.com / admin123');
        }
    }

    async addDefaultContent() {
        const contentExists = await this.get('SELECT COUNT(*) as count FROM content');
        if (contentExists.count === 0) {
            const defaultContent = [
                ['A1', 'Базовые понятия', 'https://vimeo.com/1096940811/313e75f168', 'vimeo', 3000],
                ['A2', 'Продвинутые техники', 'https://vimeo.com/1091471583', 'vimeo', 3000]
            ];

            for (const [module, title, videoUrl, videoType, price] of defaultContent) {
                await this.run(
                    'INSERT INTO content (module, title, videoUrl, videoType, price) VALUES (?, ?, ?, ?, ?)',
                    [module, title, videoUrl, videoType, price]
                );
            }
            console.log('Добавлен тестовый контент');
        }
    }

    // Базовые методы для работы с БД
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }

    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async all(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.db.all(sql, params, (err, rows) {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

    // Методы для работы с пользователями
    async createUser(email, password) {
        const referralCode = this.generateReferralCode();
        try {
            const result = await this.run(
                'INSERT INTO users (email, password, referralCode) VALUES (?, ?, ?)',
                [email, password, referralCode]
            );
            
            // Создаем запись в таблице промокодов
            await this.run(
                'INSERT INTO promo_codes (code, userId) VALUES (?, ?)',
                [referralCode, result.id]
            );

            return { success: true, userId: result.id, referralCode };
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, message: 'Пользователь с таким email уже существует' };
            }
            throw err;
        }
    }

    async getUserByEmail(email) {
        return await this.get('SELECT * FROM users WHERE email = ?', [email]);
    }

    async getUserById(id) {
        return await this.get('SELECT * FROM users WHERE id = ?', [id]);
    }

    async updateUser(id, updates) {
        const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updates);
        values.push(id);
        
        await this.run(`UPDATE users SET ${fields} WHERE id = ?`, values);
        return true;
    }

    async getAllUsers() {
        return await this.all('SELECT * FROM users ORDER BY createdAt DESC');
    }

    // Методы для работы с модулями
    async getUserModules(userId) {
        const rows = await this.all(
            'SELECT c.* FROM content c JOIN user_modules um ON c.module = um.module WHERE um.userId = ?',
            [userId]
        );
        return rows.map(row => row.module);
    }

    async addUserModule(userId, module) {
        try {
            await this.run(
                'INSERT INTO user_modules (userId, module) VALUES (?, ?)',
                [userId, module]
            );
            return true;
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                // Модуль уже добавлен
                return true;
            }
            throw err;
        }
    }

    async getAllContent() {
        return await this.all('SELECT * FROM content ORDER BY module');
    }

    async addContent(contentData) {
        const result = await this.run(
            'INSERT INTO content (module, title, videoUrl, videoType, price) VALUES (?, ?, ?, ?, ?)',
            [contentData.module, contentData.title, contentData.videoUrl, contentData.videoType, contentData.price]
        );
        return { success: true, id: result.id };
    }

    async updateContent(id, updates) {
        const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updates);
        values.push(id);
        
        await this.run(`UPDATE content SET ${fields} WHERE id = ?`, values);
        return true;
    }

    async deleteContent(id) {
        await this.run('DELETE FROM content WHERE id = ?', [id]);
        return true;
    }

    // Методы для работы с заказами (ОБНОВЛЕНО)
    async createOrder(orderData) {
        const { email, module, amountRUB, bonuses, promoCode, status } = orderData;
        const orderId = this.generateOrderId();
        
        await this.run(
            'INSERT INTO orders (id, email, module, amountRUB, bonuses, promoCode, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [orderId, email, module, amountRUB, bonuses || 0, promoCode || null, status || 'pending']
        );
        
        return orderId;
    }

    async updateOrderStatus(orderId, status) {
        await this.run(
            'UPDATE orders SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [status, orderId]
        );
    }

    async getOrder(orderId) {
        return await this.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    }

    // Методы для работы с промокодами
    async checkPromoCode(promoCode) {
        const promo = await this.get(
            'SELECT p.*, u.email FROM promo_codes p JOIN users u ON p.userId = u.id WHERE p.code = ?',
            [promoCode]
        );
        return promo;
    }

    async usePromoCode(promoCode, usedByEmail) {
        await this.run(
            'UPDATE promo_codes SET usedBy = ?, usedAt = CURRENT_TIMESTAMP WHERE code = ?',
            [usedByEmail, promoCode]
        );
        
        // Начисляем бонусы владельцу промокода
        const promo = await this.checkPromoCode(promoCode);
        if (promo && promo.userId) {
            await this.run(
                'UPDATE users SET bonusBalance = bonusBalance + 500 WHERE id = ?',
                [promo.userId]
            );
        }
    }

    // Методы для работы с администраторами
    async checkAdmin(email, password) {
        return await this.get(
            'SELECT * FROM admins WHERE email = ? AND password = ?',
            [email, password]
        );
    }

    // Вспомогательные методы
    generateReferralCode() {
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let result = '';
        for (let i = 0; i < 5; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    generateOrderId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 5);
        return `order_${timestamp}_${random}`;
    }

    async close() {
        return new Promise((resolve) => {
            this.db.close((err) => {
                if (err) console.error('Ошибка закрытия БД:', err);
                else console.log('База данных закрыта');
                resolve();
            });
        });
    }
}

module.exports = Database;

