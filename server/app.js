const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('node:path');
const authRoutes = require('./routes/auth.routes');
const projectRoutes = require('./routes/project.routes');
const errorHandler = require('./middleware/error.middleware');
const { apiLimiter } = require('./middleware/rate-limit.middleware');

const app = express();

// Hardening de Cabeçalhos HTTP com Helmet
// Configurações personalizadas para permitir scripts/estilos locais e fontes
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            frameSrc: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Configuração granular e segura de CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
    origin: (origin, callback) => {
        // Permite requisições sem origin (ex: chamadas no mesmo host, healthchecks locais)
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        return callback(new Error('Acesso bloqueado pela política de CORS.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middlewares essenciais de parsing com limites estritos de payload
app.use(cookieParser());
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
