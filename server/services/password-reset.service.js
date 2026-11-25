const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../config/database');
const { supabase: defaultSupabase, isSupabaseConfigured } = require('../config/supabase');
const { sendPasswordResetEmail } = require('./email.service');

const TOKEN_EXPIRY_HOURS = 1;
const JWT_SECRET = process.env.JWT_SECRET || 'gestao-projetos-secret-key-dev-only-2026';

const _UNSET = Symbol('unset');

class PasswordResetService {
    constructor(db = null, supabase = _UNSET) {
        this.db = db || getDatabase();
        this.supabase = supabase === _UNSET
            ? (isSupabaseConfigured() ? defaultSupabase : null)
            : supabase;
    }

    // -------------------------------------------------------------------------
    // Gera token seguro (JWT stateless assinado com hash atual da senha -> uso único garantido)
    // Não depende de tabela extra no Supabase; funciona em qualquer instância.
    // -------------------------------------------------------------------------
    async requestReset(email) {
        const normalizedEmail = email.trim().toLowerCase();
        const user = await this._findUserByEmail(normalizedEmail);

        if (user) {
            const secret = `${JWT_SECRET}:${user.password_hash || ''}`;
            const token = jwt.sign(
                { uid: user.id, email: user.email, purpose: 'password_reset' },
                secret,
                { expiresIn: `${TOKEN_EXPIRY_HOURS}h` }
            );

            await sendPasswordResetEmail(user.email, user.name, token);
        }

        // Sempre responde com sucesso (evita user-enumeration)
        return true;
    }

    // -------------------------------------------------------------------------
    // Valida o token (JWT stateless ou legado do banco) e redefine a senha
    // -------------------------------------------------------------------------
    async resetPassword(token, newPassword) {
        if (!token || typeof token !== 'string' || token.length < 10) {
            throw new Error('Token inválido.');
        }
        if (!newPassword || newPassword.length < 6) {
            throw new Error('A nova senha deve ter no mínimo 6 caracteres.');
        }

        // 1. Tenta validação stateless via JWT
        const decoded = jwt.decode(token);
        if (decoded && decoded.purpose === 'password_reset' && decoded.email) {
            const user = await this._findUserByEmail(decoded.email);
            if (!user) {
                throw new Error('Link de recuperação inválido ou já utilizado.');
            }

            try {
                const secret = `${JWT_SECRET}:${user.password_hash || ''}`;
                jwt.verify(token, secret);
            } catch (jwtErr) {
                if (jwtErr.name === 'TokenExpiredError') {
                    throw new Error('O link de recuperação expirou. Solicite um novo.');
                }
                throw new Error('Link de recuperação inválido ou já utilizado.');
            }

            const passwordHash = await bcrypt.hash(newPassword, 10);
            await this._updateUserPasswordDirect(user, passwordHash);
            return true;
        }

        // 2. Fallback para tokens hex legados salvos em banco
        const record = await this._findToken(token);
        if (!record) {
            throw new Error('Link de recuperação inválido ou já utilizado.');
        }

        const now = new Date();
        const expiresAt = new Date(record.expires_at);
        if (now > expiresAt) {
            throw new Error('O link de recuperação expirou. Solicite um novo.');
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await this._updatePassword(record, token, passwordHash);

        return true;
    }

    // -------------------------------------------------------------------------
    // Internals: Supabase-first, SQLite fallback
    // -------------------------------------------------------------------------

    async _findUserByEmail(email) {
        if (this.supabase) {
            try {
                const { data, error } = await this.supabase
                    .from('users')
                    .select('id, name, email, password_hash')
                    .eq('email', email)
                    .maybeSingle();
                if (!error && data) return data;
            } catch (err) {
                // Fallback no SQLite
            }
        }

        const row = this.db.prepare(
            'SELECT id, name, email, password_hash FROM users WHERE email = ?'
        ).get(email);
        return row || null;
    }

    async _updateUserPasswordDirect(user, passwordHash) {
        if (this.supabase) {
            try {
                await this.supabase
                    .from('users')
                    .update({ password_hash: passwordHash })
                    .eq('email', user.email);
            } catch (err) {
                console.warn('[PasswordReset] Erro ao sincronizar senha com Supabase:', err.message);
            }
        }

        try {
            this.db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(passwordHash, user.email);
        } catch (dbErr) {
            console.warn('[PasswordReset] Erro ao atualizar senha no SQLite local:', dbErr.message);
        }
    }

    async _saveToken(user, token, expiresAt) {
        const expiresIso = expiresAt.toISOString();

        // Invalida tokens anteriores do mesmo usuário antes de criar um novo
        if (this.supabase) {
            try {
                await this.supabase
                    .from('password_reset_tokens')
                    .update({ used: true })
                    .eq('user_id', user.id)
                    .eq('used', false);

                const { error } = await this.supabase
                    .from('password_reset_tokens')
                    .insert({ user_id: user.id, token, expires_at: expiresIso, used: false });

                if (error) {
                    console.error('[PasswordReset] Falha ao salvar token no Supabase:', error.message);
                    this._saveTokenLocal(user, token, expiresIso);
                }
                return;
            } catch (err) {
                console.warn('[PasswordReset] Erro de rede com Supabase, usando armazenamento local:', err.message);
                this._saveTokenLocal(user, token, expiresIso);
                return;
            }
        }

        this._saveTokenLocal(user, token, expiresIso);
    }

    _saveTokenLocal(user, token, expiresIso) {
        const userObj = typeof user === 'object' && user !== null ? user : { id: user };
        let localUserId = null;

        // Sempre resolve o ID no SQLite pelo e-mail primeiro para evitar descompasso de sequências
        if (userObj.email) {
            const row = this.db.prepare('SELECT id FROM users WHERE email = ?').get(userObj.email);
            if (row) {
                localUserId = row.id;
            }
        }

        // Fallback: se não tiver email ou não encontrou, tenta buscar por ID
        if (!localUserId && userObj.id) {
            const row = this.db.prepare('SELECT id FROM users WHERE id = ?').get(userObj.id);
            if (row) {
                localUserId = row.id;
            }
        }

        if (!localUserId) {
            console.error('[PasswordReset] Usuário local não encontrado para associar o token.');
            return;
        }

        this.db.prepare(`
            UPDATE password_reset_tokens SET used = 1
            WHERE user_id = ? AND used = 0
        `).run(localUserId);

        this.db.prepare(`
            INSERT INTO password_reset_tokens (user_id, token, expires_at, used)
            VALUES (?, ?, ?, 0)
        `).run(localUserId, token, expiresIso);
    }

    async _findToken(token) {
        if (this.supabase) {
            try {
                const { data, error } = await this.supabase
                    .from('password_reset_tokens')
                    .select('id, user_id, expires_at, used')
                    .eq('token', token)
                    .eq('used', false)
                    .maybeSingle();
                if (!error && data) return data;
            } catch (err) {
                // Fallback no SQLite
            }
        }

        const row = this.db.prepare(`
            SELECT id, user_id, expires_at, used
            FROM password_reset_tokens
            WHERE token = ? AND used = 0
        `).get(token);
        return row || null;
    }

    async _updatePassword(record, token, passwordHash) {
        // Busca email do usuário local para sincronizar ambos os bancos
        const localUser = this.db.prepare(
            'SELECT id, email FROM users WHERE id = ?'
        ).get(record.user_id);

        const email = localUser ? localUser.email : null;

        if (this.supabase) {
            try {
                const userQuery = email
                    ? this.supabase.from('users').update({ password_hash: passwordHash }).eq('email', email)
                    : this.supabase.from('users').update({ password_hash: passwordHash }).eq('id', record.user_id);

                await Promise.all([
                    userQuery,
                    this.supabase.from('password_reset_tokens').update({ used: true }).eq('token', token)
                ]);
            } catch (err) {
                console.warn('[PasswordReset] Erro ao sincronizar senha com Supabase:', err.message);
            }
        }

        // Atualiza localmente no SQLite
        if (localUser) {
            this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, localUser.id);
        } else if (email) {
            this.db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(passwordHash, email);
        }

        this.db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);
    }
}

module.exports = PasswordResetService;
