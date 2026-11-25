const AuthService = require('../services/auth.service');
const { getDatabase } = require('../config/database');
const { isSupabaseConfigured } = require('../config/supabase');

const authService = new AuthService();

const authMiddleware = (req, res, next) => {
    try {
        let token = null;

        // 1. Tenta obter o token do cookie assinado (signedCookies) ou regular seguro HttpOnly
        if (req.signedCookies && req.signedCookies.nexus_token) {
            token = req.signedCookies.nexus_token;
        } else if (req.cookies && req.cookies.nexus_token) {
            token = req.cookies.nexus_token;
        }

        // 2. Fallback para cabeçalho Authorization: Bearer <token>
        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader) {
                const parts = authHeader.split(' ');
                if (parts.length === 2 && parts[0] === 'Bearer') {
                    token = parts[1];
                }
            }
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Token de autorização não fornecido. Faça login para continuar.'
            });
        }

        const decoded = authService.verifyToken(token);

        // Verifica se o usuário do token ainda existe no banco local (SQLite).
        // Isso previne o erro "FOREIGN KEY constraint failed" quando o token é
        // válido mas o user_id referenciado foi deletado (ex: limpeza de testes).
        if (!isSupabaseConfigured()) {
            const db = getDatabase();
            const user = db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.id);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'Sessão expirada. Seu usuário não foi encontrado. Faça login novamente.'
                });
            }
        }

        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: 'Sessão expirada ou token inválido. Faça login novamente.'
        });
    }
};

module.exports = authMiddleware;
