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

// Rate limiter estrito para rotas de autenticação e recuperação de credenciais
// Limita a 10 tentativas a cada 15 minutos para mitigar ataques de força bruta
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Muitas tentativas de autenticação ou recuperação. Bloqueio temporário por 15 minutos.'
    }
});

module.exports = {
    apiLimiter,
    authLimiter
};
