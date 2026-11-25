const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const VerificationService = require('../server/services/verification.service');
const NotificationCronService = require('../server/services/notification-cron.service');
const AlertService = require('../server/services/alert.service');

describe('Fluxos de E-mail: Verificação de Conta e Avisos Periódicos', () => {
    let db;
    let verificationService;

    beforeEach(() => {
        db = new DatabaseSync(':memory:');
        db.exec(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                email_verified INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE email_verification_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at DATETIME NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        verificationService = new VerificationService(db, null);
    });

    test('1. Deve gerar token de ativação e salvar com used=0', async () => {
        db.prepare('INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, ?, 0)')
            .run('João Silva', 'joao@fazenda.com.br', 'hash123');

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get('joao@fazenda.com.br');
        const { token } = await verificationService.sendVerification(user);

        assert.ok(token);
        assert.equal(typeof token, 'string');
        assert.ok(token.length >= 48);

        const saved = db.prepare('SELECT * FROM email_verification_tokens WHERE token = ?').get(token);
        assert.ok(saved);
        assert.equal(saved.used, 0);
        assert.equal(saved.user_id, user.id);
    });

    test('2. Deve validar o token, marcar como used=1 e atualizar email_verified=1', async () => {
        db.prepare('INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, ?, 0)')
            .run('Maria Santos', 'maria@fazenda.com.br', 'hash123');

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get('maria@fazenda.com.br');
        const { token } = await verificationService.sendVerification(user);

        const verifiedUser = await verificationService.verifyToken(token);
        assert.ok(verifiedUser);
        assert.equal(verifiedUser.email_verified, 1);

        const tokenRow = db.prepare('SELECT * FROM email_verification_tokens WHERE token = ?').get(token);
        assert.equal(tokenRow.used, 1);

        const userInDb = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
        assert.equal(userInDb.email_verified, 1);
    });

    test('3. Reutilização de token já utilizado deve lançar erro', async () => {
        db.prepare('INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, ?, 0)')
            .run('Carlos Agrônomo', 'carlos@fazenda.com.br', 'hash123');

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get('carlos@fazenda.com.br');
        const { token } = await verificationService.sendVerification(user);

        // Primeira validação
        await verificationService.verifyToken(token);

        // Segunda tentativa deve falhar
        await assert.rejects(
            async () => {
                await verificationService.verifyToken(token);
            },
            { message: /Link de confirmação inválido ou já utilizado/ }
        );
    });

    test('4. Token expirado deve lançar erro sem ativar a conta', async () => {
        db.prepare('INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, ?, 0)')
            .run('Ana Paula', 'ana@fazenda.com.br', 'hash123');

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get('ana@fazenda.com.br');
        const token = 'token-antigo-expirado-1234567890';
        const expiredIso = new Date(Date.now() - 3600 * 1000).toISOString(); // 1h no passado

        db.prepare('INSERT INTO email_verification_tokens (user_id, token, expires_at, used) VALUES (?, ?, ?, 0)')
            .run(user.id, token, expiredIso);

        await assert.rejects(
            async () => {
                await verificationService.verifyToken(token);
            },
            { message: /O link de confirmação expirou/ }
        );

        const userInDb = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
        assert.equal(userInDb.email_verified, 0);
    });
});
