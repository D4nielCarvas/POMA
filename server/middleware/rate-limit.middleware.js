const rateLimit = require('express-rate-limit');

// Rate limiter geral para APIs (100 requisições a cada 15 minutos por IP)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Muitas requisições originadas deste IP. Por favor, tente novamente em alguns minutos.'
    }
});

// Rate limiter específico para login (Limite de 5 tentativas consecutivas a cada 15 minutos)
// Protege ativamente contra ataques de força bruta em contas de usuários
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Máximo 5 tentativas de login por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Você excedeu o limite de 5 tentativas de login. Por motivos de segurança, aguarde 15 minutos ou utilize a recuperação de senha.'
    }
});

// Rate limiter para cadastro e recuperação de credenciais (15 tentativas a cada 15 minutos)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Muitas tentativas de requisição nesta rota. Bloqueio temporário por 15 minutos.'
    }
});

module.exports = {
    apiLimiter,
    authLimiter,
    loginLimiter
};
