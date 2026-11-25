const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('node:path');
const authRoutes = require('./routes/auth.routes');
const projectRoutes = require('./routes/project.routes');
const errorHandler = require('./middleware/error.middleware');
const { apiLimiter } = require('./middleware/rate-limit.middleware');

const app = express();

// 1. Confiança em Proxy Reverso (Render, Vercel, Cloudflare, Nginx)
// Essencial para identificação correta de IP real do cliente no rate limiting e detecção de HTTPS
app.set('trust proxy', 1);

// 2. Redirecionamento forçado para HTTPS em Produção
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(301, `https://${req.headers.host}${req.url}`);
        }
        next();
    });
}

// 3. Compressão HTTP (Gzip/Brotli) para respostas JSON e arquivos estáticos
app.use(compression());

// 4. Hardening de Cabeçalhos HTTP com Helmet
// Configurações personalizadas para permitir scripts/estilos locais, Google Fonts e inline handlers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"], // Permite handlers como onclick/onsubmit dinâmicos
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            frameSrc: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Configuração resiliente de CORS
const rawAllowed = process.env.ALLOWED_ORIGINS || process.env.APP_URL || '';
const configuredOrigins = rawAllowed
    .split(',')
    .map(o => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // 1. Requisições sem header 'Origin' (ex: chamadas server-to-server, curl, health check, mobile)
        if (!origin) {
            return callback(null, true);
        }

        const normalizedOrigin = origin.trim().replace(/\/+$/, '');

        // 2. Sempre aceita localhost / 127.0.0.1 em qualquer porta para desenvolvimento local
        const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalizedOrigin);
        if (isLocalhost) {
            return callback(null, true);
        }

        // 3. Se for o mesmo domínio da URL da aplicação em produção (Render, Vercel, domínio próprio)
        if (process.env.APP_URL) {
            const normalizedAppUrl = process.env.APP_URL.trim().replace(/\/+$/, '');
            if (normalizedOrigin === normalizedAppUrl) {
                return callback(null, true);
            }
        }

        // 4. Se estiver explicitamente listado em ALLOWED_ORIGINS
        if (configuredOrigins.includes(normalizedOrigin)) {
            return callback(null, true);
        }

        // 5. Permite automaticamente origens *.onrender.com caso o app esteja no Render
        if (/\.onrender\.com$/i.test(new URL(origin).hostname)) {
            return callback(null, true);
        }

        // 6. Em ambiente que não seja produção estrita, permite por padrão
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }

        // Caso contrário, recusa graciosamente com false (não com Error, para responder 204/CORS limpo)
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middlewares essenciais de parsing com limites estritos de payload e assinatura de cookies
const cookieSecret = process.env.COOKIE_SECRET || process.env.JWT_SECRET || 'nexus-poma-secure-cookie-salt';
app.use(cookieParser(cookieSecret));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Servidor de arquivos estáticos do Frontend
app.use(express.static(path.join(__dirname, '../public')));

// Aplica limitação geral de taxa em rotas sob /api
app.use('/api', apiLimiter);

// Rotas da API RESTful
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);

// Endpoint de Health Check
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback SPA: qualquer requisição não atendida pelas APIs entrega a SPA frontend
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ success: false, error: 'Endpoint não encontrado.' });
    }
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Middleware Central de Erros
app.use(errorHandler);

module.exports = app;
