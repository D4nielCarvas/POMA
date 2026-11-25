const { getDatabase } = require('../config/database');
const { supabase: defaultSupabase, isSupabaseConfigured } = require('../config/supabase');
const ProjectRepository = require('../models/project.repository');
const ActivityRepository = require('../models/activity.repository');
const UserRepository = require('../models/user.repository');
const AlertService = require('./alert.service');
const { sendDailyDigestEmail } = require('./email.service');

const _UNSET = Symbol('unset');

class NotificationCronService {
    constructor(
        projectRepo = null,
        activityRepo = null,
        userRepo = null,
        db = null,
        supabase = _UNSET
    ) {
        this.projectRepo = projectRepo || new ProjectRepository();
        this.activityRepo = activityRepo || new ActivityRepository();
        this.userRepo = userRepo || new UserRepository();
        this.db = db || getDatabase();
        this.supabase = supabase === _UNSET
            ? (isSupabaseConfigured() ? defaultSupabase : null)
            : supabase;
    }

    /**
     * Executa a varredura matinal de prazos e envia digests por e-mail
     * para todos os usuários/responsáveis que possuam pendências críticas.
     */
    async executeDailyDigest() {
        // 1. Busca todos os usuários ativos do sistema
        const users = await this._getActiveUsers();
        if (!users || users.length === 0) {
            return { emailsSent: 0, details: [], message: 'Nenhum usuário ativo encontrado.' };
        }

        const emailResults = [];

        // 2. Para cada usuário, avalia seus projetos e atividades
        for (const user of users) {
            try {
                // Busca projetos do usuário
                const rawProjects = await Promise.resolve(this.projectRepo.findAll(user.id, {}));
                if (!rawProjects || rawProjects.length === 0) continue;

                const projectIds = rawProjects.map(p => p.id);
                const activities = await Promise.resolve(this.activityRepo.findByProjectIds(projectIds));

                const activitiesByProject = new Map();
                for (const act of activities) {
                    if (!activitiesByProject.has(act.project_id)) activitiesByProject.set(act.project_id, []);
                    activitiesByProject.get(act.project_id).push(act);
                }

                const overdueActivities = [];
                const upcomingActivities = [];

                for (const proj of rawProjects) {
                    const projActivities = activitiesByProject.get(proj.id) || [];
                    const enriched = AlertService.enrichProjectWithAlerts(proj, projActivities);

                    // Ignora projetos já concluídos
                    if (enriched.status === 'Concluído' || enriched.deadline_info?.status === 'concluido') {
                        continue;
                    }

                    for (const act of enriched.activities) {
                        if (act.status === 'Concluída') continue;

                        if (act.deadline_info?.status === 'atrasada') {
                            overdueActivities.push({
                                id: act.id,
                                name: act.name,
                                activityName: act.name,
                                projectId: proj.id,
                                projectName: proj.name,
                                date: act.target_date,
                                daysOverdue: Math.abs(act.deadline_info.daysRemaining || 0)
                            });
                        } else if (act.deadline_info?.status === 'alerta') {
                            upcomingActivities.push({
                                id: act.id,
                                name: act.name,
                                activityName: act.name,
                                projectId: proj.id,
                                projectName: proj.name,
                                date: act.target_date,
                                daysRemaining: act.deadline_info.daysRemaining
                            });
                        }
                    }
                }

                // Dispara o e-mail apenas se houver pelo menos 1 alerta crítico
                if (overdueActivities.length > 0 || upcomingActivities.length > 0) {
                    const digestData = {
                        overdueActivities,
                        upcomingActivities,
                        totalProjects: rawProjects.length
                    };

                    const sendResult = await sendDailyDigestEmail(user.email, user.name, digestData);
                    emailResults.push({
                        userEmail: user.email,
                        userName: user.name,
                        overdueCount: overdueActivities.length,
                        upcomingCount: upcomingActivities.length,
                        messageId: sendResult?.messageId,
                        error: sendResult?.error
                    });
                }
            } catch (userErr) {
                console.error(`[Cron Daily Digest Error] Falha ao processar usuário ${user.email}:`, userErr.message);
            }
        }

        return {
            success: true,
            emailsSent: emailResults.length,
            details: emailResults
        };
    }

    async _getActiveUsers() {
        if (this.supabase) {
            try {
                const { data, error } = await this.supabase
                    .from('users')
                    .select('id, name, email');
                if (!error && Array.isArray(data) && data.length > 0) {
                    return data;
                }
            } catch (err) {}
        }

        try {
            const rows = this.db.prepare('SELECT id, name, email FROM users').all();
            return rows || [];
        } catch (e) {
            return [];
        }
    }
}

module.exports = NotificationCronService;
