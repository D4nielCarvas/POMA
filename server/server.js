const app = require('./app');
const { getDatabase } = require('./config/database');

const PORT = process.env.PORT || 3000;

// Inicializa banco de dados
try {
    getDatabase();
    console.log('[Database] Conexão com SQLite inicializada com sucesso.');
} catch (err) {
    console.error('[Database Error] Falha ao inicializar banco de dados:', err);
    process.exit(1);
}

// Diagnóstico de conexão com Supabase
const { isSupabaseConfigured } = require('./config/supabase');
if (isSupabaseConfigured()) {
    console.log('[Supabase] Cliente de nuvem configurado e ativo.');
} else {
    console.warn('[Supabase Warning] Credenciais ausentes. Operando exclusivamente em modo SQLite local.');
}

const server = app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Sistema de Gestão de Projetos rodando na porta ${PORT}`);
    console.log(`👉 Acesse a aplicação em: http://localhost:${PORT}`);
    console.log(`=======================================================`);

    // ── Keep-Alive Self-Ping ────────────────────────────────────────
    // Evita que o Render Free Tier adormeça o serviço após 15 min de
    // inatividade. Faz um ping a cada 14 minutos no endpoint de health.
    // Só ativa em produção e quando APP_URL estiver configurada.
    // ────────────────────────────────────────────────────────────────
    const appUrl = process.env.APP_URL;
    if (process.env.NODE_ENV === 'production' && appUrl) {
        const KEEP_ALIVE_INTERVAL_MS = 14 * 60 * 1000; // 14 minutos
        const healthUrl = `${appUrl.replace(/\/+$/, '')}/api/health`;
        const httpModule = healthUrl.startsWith('https') ? require('node:https') : require('node:http');

        const keepAlive = () => {
            httpModule.get(healthUrl, (res) => {
                console.log(`[Keep-Alive] Ping OK — status ${res.statusCode} — ${new Date().toISOString()}`);
                res.resume(); // Descarta o corpo para liberar memória
            }).on('error', (err) => {
                console.warn(`[Keep-Alive] Ping falhou: ${err.message}`);
            });
        };

        setInterval(keepAlive, KEEP_ALIVE_INTERVAL_MS);
        console.log(`[Keep-Alive] Self-ping ativo a cada 14 min → ${healthUrl}`);
    }
});

// Encerramento gracioso
const shutdown = () => {
    console.log('\n[Server] Encerrando servidor graciosamente...');
    server.close(() => {
        console.log('[Server] Conexões encerradas.');
        process.exit(0);
    });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
