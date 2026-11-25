const express = require('express');
const NotificationCronService = require('../services/notification-cron.service');

const router = express.Router();
const cronService = new NotificationCronService();

/**
 * POST /api/cron/daily-digest
 * Autenticação via segredo no header (X-Cron-Key) ou query parameter (?key=)
 * Usado pelo cron-job.org, Render Cron Jobs ou chamadas internas agendadas.
 */
router.post('/daily-digest', async (req, res, next) => {
    try {
        const expectedSecret = process.env.CRON_SECRET || process.env.JWT_SECRET || 'nexus-poma-cron-secret';
        const receivedKey = req.headers['x-cron-key'] || req.query.key;

        if (!receivedKey || receivedKey !== expectedSecret) {
            return res.status(401).json({
                success: false,
                error: 'Acesso não autorizado. Chave de cron inválida ou ausente.'
            });
        }

        const result = await cronService.executeDailyDigest();
        return res.status(200).json({
            success: true,
            message: 'Rotina de alertas matinais executada com sucesso.',
            data: result
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
