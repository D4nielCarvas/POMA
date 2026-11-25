const { getDatabase } = require('../config/database');
const { supabase: defaultSupabase, isSupabaseConfigured } = require('../config/supabase');

const _UNSET = Symbol('unset');

class UserRepository {
    constructor(db = null, supabase = _UNSET) {
        this.db = db || getDatabase();
        this.supabase = supabase === _UNSET
            ? (isSupabaseConfigured() ? defaultSupabase : null)
            : supabase;
    }

    async create({ name, email, passwordHash, role = 'user', emailVerified = 0 }) {
        let createdUser = null;

        // 1. Se o Supabase estiver disponível, grava na nuvem
        if (this.supabase) {
            const insertPayload = {
                name,
                email,
                password_hash: passwordHash,
                role
            };
            if (emailVerified !== undefined) {
                insertPayload.email_verified = Boolean(emailVerified);
            }

            const { data, error } = await this.supabase
                .from('users')
                .insert(insertPayload)
                .select('id, name, email, role, created_at')
                .single();

            if (error) {
                console.error('[Supabase UserRepository Error] Falha ao persistir usuário:', error.message);
                throw new Error(`Falha ao registrar usuário no Supabase: ${error.message}`);
            }

            createdUser = data;
        }

        // 2. Sincroniza no SQLite local (cache para integridade referencial)
        // Usa UPSERT por email para evitar conflito de PK entre sequências independentes
        if (createdUser) {
            try {
                this.db.prepare(`
                    INSERT INTO users (name, email, password_hash, role, email_verified)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(email) DO UPDATE SET
                        name = excluded.name,
                        password_hash = excluded.password_hash,
                        role = excluded.role,
                        email_verified = excluded.email_verified
                `).run(name, email, passwordHash, role, emailVerified ? 1 : 0);
            } catch (cacheErr) {
                console.warn('[Cache Sync Warning] Falha ao sincronizar usuário criado no SQLite local:', cacheErr.message);
            }

            return {
                id: createdUser.id,
                name: createdUser.name,
                email: createdUser.email,
                role: createdUser.role,
                email_verified: emailVerified ? 1 : 0
            };
        }

        // Fallback SQLite nativo se Supabase não estiver configurado
        const fallbackStmt = this.db.prepare(`
            INSERT INTO users (name, email, password_hash, role, email_verified)
            VALUES (?, ?, ?, ?, ?)
        `);
        const result = fallbackStmt.run(name, email, passwordHash, role, emailVerified ? 1 : 0);
        return {
            id: Number(result.lastInsertRowid),
            name,
            email,
            role,
            email_verified: emailVerified ? 1 : 0
        };
    }

    async findByEmail(email) {
        // 1. Consulta no Supabase se configurado
        if (this.supabase) {
            const { data, error } = await this.supabase
                .from('users')
                .select('id, name, email, password_hash, role, email_verified, created_at')
                .eq('email', email)
                .maybeSingle();

            if (!error && data) {
                // Sincroniza cache local no SQLite (UPSERT por email, sem forçar ID)
                try {
                    this.db.prepare(`
                        INSERT INTO users (name, email, password_hash, role, email_verified)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(email) DO UPDATE SET
                            name = excluded.name,
                            password_hash = excluded.password_hash,
                            role = excluded.role,
                            email_verified = excluded.email_verified
                    `).run(data.name, data.email, data.password_hash, data.role, data.email_verified ? 1 : 0);
                } catch (cacheErr) {
                    console.warn('[Cache Sync Warning] Falha ao sincronizar usuário no SQLite local:', cacheErr.message);
                }
                return data;
            }
        }

        // 2. Fallback no SQLite local
        const stmt = this.db.prepare(`
            SELECT id, name, email, password_hash, role, email_verified, created_at
            FROM users
            WHERE email = ?
        `);
        const row = stmt.get(email);
        return row || null;
    }

    async findById(id) {
        if (this.supabase) {
            const { data, error } = await this.supabase
                .from('users')
                .select('id, name, email, role, email_verified, created_at')
                .eq('id', id)
                .maybeSingle();

            if (!error && data) {
                return data;
            }
        }

        const stmt = this.db.prepare(`
            SELECT id, name, email, role, email_verified, created_at
            FROM users
            WHERE id = ?
        `);
        const row = stmt.get(id);
        return row || null;
    }
}

module.exports = UserRepository;
