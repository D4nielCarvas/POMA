const crypto = require('node:crypto');
const { getDatabase } = require('../config/database');
const { supabase: defaultSupabase, isSupabaseConfigured } = require('../config/supabase');
const { sendAccountVerificationEmail } = require('./email.service');

const TOKEN_EXPIRY_HOURS = 24;
const _UNSET = Symbol('unset');

class VerificationService {
    constructor(db = null, supabase = _UNSET) {
        this.db = db || getDatabase();
        this.supabase = supabase === _UNSET
            ? (isSupabaseConfigured() ? defaultSupabase : null)
            : supabase;
    }

    /**
     * Cria e envia token de confirmação de conta para o e-mail do usuário
     */
    async sendVerification(user) {
        if (!user || !user.id || !user.email) {
            throw new Error('Usuário inválido para envio de confirmação.');
        }

        const token = crypto.randomBytes(48).toString('hex');
        const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

        await this._saveToken(user.id, token, expiresAt);
        await sendAccountVerificationEmail(user.email, user.name, token);

        return { token, expiresAt };
    }

    /**
     * Valida o token e ativa a conta do usuário
     */
    async verifyToken(token) {
        if (!token || typeof token !== 'string' || token.length < 10) {
            throw new Error('Token de verificação inválido.');
        }

        const record = await this._findToken(token);
        if (!record) {
            throw new Error('Link de confirmação inválido ou já utilizado.');
        }

        const now = new Date();
        const expiresAt = new Date(record.expires_at);
        if (now > expiresAt) {
            throw new Error('O link de confirmação expirou. Solicite um novo envio.');
        }

        await this._markUserVerified(record.user_id, token);
        const user = await this._findUserById(record.user_id);

        return user;
    }

    /**
     * Reenvia o e-mail de confirmação caso o usuário ainda não esteja verificado
     */
    async resendVerification(email) {
        const normalizedEmail = (email || '').trim().toLowerCase();
        if (!normalizedEmail) {
            throw new Error('Informe um endereço de e-mail válido.');
        }

        const user = await this._findUserByEmail(normalizedEmail);
        if (!user) {
            // Anti-enumeração: não revela se o e-mail existe
            return true;
        }

        if (user.email_verified === 1 || user.email_verified === true) {
            return { alreadyVerified: true };
        }

        await this.sendVerification(user);
        return { success: true };
    }

    // -------------------------------------------------------------------------
    // Persistência interna (Supabase com fallback SQLite)
    // -------------------------------------------------------------------------

    async _saveToken(userId, token, expiresAt) {
        const expiresIso = expiresAt.toISOString();

        if (this.supabase) {
            try {
                await this.supabase
                    .from('email_verification_tokens')
                    .update({ used: true })
                    .eq('user_id', userId)
                    .eq('used', false);

                await this.supabase
                    .from('email_verification_tokens')
                    .insert({
                        user_id: userId,
                        token,
                        expires_at: expiresIso,
                        used: false
                    });
                return;
            } catch (err) {
                // Fallback no SQLite local
            }
        }

        try {
            this.db.prepare(`
                UPDATE email_verification_tokens
                SET used = 1
                WHERE user_id = ? AND used = 0
            `).run(userId);

            this.db.prepare(`
                INSERT INTO email_verification_tokens (user_id, token, expires_at, used)
                VALUES (?, ?, ?, 0)
            `).run(userId, token, expiresIso);
        } catch (dbErr) {
            console.error('[VerificationService] Erro ao salvar token no SQLite:', dbErr.message);
            throw dbErr;
        }
    }

    async _findToken(token) {
        if (this.supabase) {
            try {
                const { data, error } = await this.supabase
                    .from('email_verification_tokens')
                    .select('id, user_id, token, expires_at, used')
                    .eq('token', token)
                    .eq('used', false)
                    .maybeSingle();
                if (!error && data) return data;
            } catch (err) {
                // Fallback SQLite
            }
        }

        try {
            const row = this.db.prepare(`
                SELECT id, user_id, token, expires_at, used
                FROM email_verification_tokens
                WHERE token = ? AND used = 0
            `).get(token);
            return row || null;
        } catch (dbErr) {
            return null;
        }
    }

    async _markUserVerified(userId, token) {
        if (this.supabase) {
            try {
                await this.supabase
                    .from('email_verification_tokens')
                    .update({ used: true })
                    .eq('token', token);

                await this.supabase
                    .from('users')
                    .update({ email_verified: true })
                    .eq('id', userId);
            } catch (err) {
                // Continua no SQLite
            }
        }

        try {
            this.db.prepare(`
                UPDATE email_verification_tokens SET used = 1 WHERE token = ?
            `).run(token);

            this.db.prepare(`
                UPDATE users SET email_verified = 1 WHERE id = ?
            `).run(userId);
        } catch (dbErr) {
            console.error('[VerificationService] Erro ao atualizar usuário como verificado:', dbErr.message);
        }
    }

    async _findUserById(userId) {
        if (this.supabase) {
            try {
                const { data, error } = await this.supabase
                    .from('users')
                    .select('id, name, email, role, email_verified')
                    .eq('id', userId)
                    .maybeSingle();
                if (!error && data) return data;
            } catch (err) {}
        }

        try {
            const row = this.db.prepare('SELECT id, name, email, role, email_verified FROM users WHERE id = ?').get(userId);
            return row || null;
        } catch (e) {
            return null;
        }
    }

    async _findUserByEmail(email) {
        if (this.supabase) {
            try {
                const { data, error } = await this.supabase
                    .from('users')
                    .select('id, name, email, role, email_verified')
                    .eq('email', email)
                    .maybeSingle();
                if (!error && data) return data;
            } catch (err) {}
        }

        try {
            const row = this.db.prepare('SELECT id, name, email, role, email_verified FROM users WHERE email = ?').get(email);
            return row || null;
        } catch (e) {
            return null;
        }
    }
}

module.exports = VerificationService;
