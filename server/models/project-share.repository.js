const { getDatabase } = require('../config/database');
const { supabase: defaultSupabase, isSupabaseConfigured } = require('../config/supabase');

const _UNSET = Symbol('unset');

class ProjectShareRepository {
    constructor(db = null, supabase = _UNSET) {
        this.db = db || getDatabase();
        this.supabase = supabase === _UNSET
            ? (isSupabaseConfigured() ? defaultSupabase : null)
            : supabase;
    }

    /**
     * Retorna os IDs dos projetos compartilhados com um usuário
     */
    async findSharedProjectIdsByUser(userId) {
        if (this.supabase) {
            const { data, error } = await this.supabase
                .from('project_shares')
                .select('project_id')
                .eq('shared_with_user_id', userId);

            if (error) {
                console.error('[Supabase ShareRepository] findSharedProjectIdsByUser error:', error.message);
                return this._findSharedProjectIdsByUserSqlite(userId);
            }
            return (data || []).map(row => row.project_id);
        }
        return this._findSharedProjectIdsByUserSqlite(userId);
    }

    _findSharedProjectIdsByUserSqlite(userId) {
        const rows = this.db.prepare(`
            SELECT project_id FROM project_shares WHERE shared_with_user_id = ?
        `).all(userId);
        return rows.map(r => r.project_id);
    }

    /**
     * Verifica se um usuário possui acesso compartilhado a um projeto
     */
    async isProjectSharedWithUser(projectId, userId) {
        if (this.supabase) {
            const { data, error } = await this.supabase
                .from('project_shares')
                .select('id')
                .eq('project_id', projectId)
                .eq('shared_with_user_id', userId)
                .maybeSingle();

            if (error) {
                console.error('[Supabase ShareRepository] isProjectSharedWithUser error:', error.message);
                return this._isProjectSharedWithUserSqlite(projectId, userId);
            }
            return !!data;
        }
        return this._isProjectSharedWithUserSqlite(projectId, userId);
    }

    _isProjectSharedWithUserSqlite(projectId, userId) {
        const row = this.db.prepare(`
            SELECT 1 FROM project_shares WHERE project_id = ? AND shared_with_user_id = ?
        `).get(projectId, userId);
        return !!row;
    }

    /**
     * Lista os usuários com os quais um projeto está compartilhado
     */
    async findSharesByProjectId(projectId) {
        if (this.supabase) {
            const { data, error } = await this.supabase
                .from('project_shares')
                .select(`
                    id,
                    project_id,
                    shared_with_user_id,
                    created_at,
                    users:shared_with_user_id (id, name, email)
                `)
                .eq('project_id', projectId);

            if (error) {
                console.error('[Supabase ShareRepository] findSharesByProjectId error:', error.message);
                return this._findSharesByProjectIdSqlite(projectId);
            }
            return (data || []).map(item => ({
                id: item.id,
                project_id: item.project_id,
                user_id: item.shared_with_user_id,
                name: item.users?.name || 'Usuário',
                email: item.users?.email || '',
                created_at: item.created_at
            }));
        }
        return this._findSharesByProjectIdSqlite(projectId);
    }

    _findSharesByProjectIdSqlite(projectId) {
        const rows = this.db.prepare(`
            SELECT
                ps.id,
                ps.project_id,
                ps.shared_with_user_id AS user_id,
                u.name,
                u.email,
                ps.created_at
            FROM project_shares ps
            JOIN users u ON ps.shared_with_user_id = u.id
            WHERE ps.project_id = ?
            ORDER BY ps.created_at DESC
        `).all(projectId);
        return rows;
    }

    /**
     * Adiciona compartilhamento de projeto com um usuário
     */
    async addShare(projectId, targetUserId) {
        if (this.supabase) {
            const { data, error } = await this.supabase
                .from('project_shares')
                .insert({
                    project_id: projectId,
                    shared_with_user_id: targetUserId
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    return { success: true, message: 'Projeto já compartilhado com este usuário.' };
                }
                console.error('[Supabase ShareRepository] addShare error:', error.message);
                throw new Error(`Falha ao compartilhar no Supabase: ${error.message}`);
            }

            try {
                this.db.prepare(`
                    INSERT OR IGNORE INTO project_shares (project_id, shared_with_user_id)
                    VALUES (?, ?)
                `).run(projectId, targetUserId);
            } catch (_) {}

            return data;
        }

        const res = this.db.prepare(`
            INSERT OR IGNORE INTO project_shares (project_id, shared_with_user_id)
            VALUES (?, ?)
        `).run(projectId, targetUserId);

        return { id: res.lastInsertRowid, project_id: projectId, shared_with_user_id: targetUserId };
    }

    /**
     * Remove o compartilhamento de um projeto com determinado usuário
     */
    async removeShare(projectId, targetUserId) {
        if (this.supabase) {
            const { error } = await this.supabase
                .from('project_shares')
                .delete()
                .eq('project_id', projectId)
                .eq('shared_with_user_id', targetUserId);

            if (error) {
                console.error('[Supabase ShareRepository] removeShare error:', error.message);
                throw new Error(`Falha ao remover compartilhamento no Supabase: ${error.message}`);
            }

            try {
                this.db.prepare(`
                    DELETE FROM project_shares WHERE project_id = ? AND shared_with_user_id = ?
                `).run(projectId, targetUserId);
            } catch (_) {}

            return true;
        }

        this.db.prepare(`
            DELETE FROM project_shares WHERE project_id = ? AND shared_with_user_id = ?
        `).run(projectId, targetUserId);
        return true;
    }
}

module.exports = ProjectShareRepository;
