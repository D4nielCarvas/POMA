const ProjectService = require('../services/project.service');

const projectService = new ProjectService();

/**
 * Validador e parser seguro de inteiros para parâmetros de rota
 * Previne falhas de parsing, injeções e comportamentos indefinidos (NaN / Float / Negativos)
 */
function parsePositiveInteger(value, paramName = 'id') {
    const num = Number(value);
    if (!Number.isInteger(num) || num <= 0) {
        const error = new Error(`Parâmetro '${paramName}' inválido. Esperado um identificador numérico inteiro positivo.`);
        error.status = 400;
        throw error;
    }
    return num;
}

class ProjectController {
    static async list(req, res, next) {
        try {
            const userId = req.user.id;
            const { classification, type, status, search, deadline_status, page, limit, offset } = req.query;

            const filters = {
                classification,
                type,
                status,
                search,
                deadline_status
            };

            // Suporte a paginação com limites seguros no banco de dados
            if (limit !== undefined || page !== undefined) {
                const parsedLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
                const parsedOffset = page !== undefined
                    ? Math.max((Number(page) - 1) * parsedLimit, 0)
                    : Math.max(Number(offset) || 0, 0);

                filters.limit = parsedLimit;
                filters.offset = parsedOffset;
            }

            const result = await projectService.getProjects(userId, filters);

            return res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    static async getById(req, res, next) {
        try {
            const userId = req.user.id;
            const projectId = parsePositiveInteger(req.params.id, 'id');

            const project = await projectService.getProjectById(projectId, userId);
            return res.status(200).json({
                success: true,
                data: project
            });
        } catch (error) {
            next(error);
        }
    }

    static async create(req, res, next) {
        try {
            const userId = req.user.id;
            const newProject = await projectService.createProject(userId, req.body);

            return res.status(201).json({
                success: true,
                message: 'Projeto cadastrado com sucesso!',
                data: newProject
            });
        } catch (error) {
            next(error);
        }
    }

    static async update(req, res, next) {
        try {
            const userId = req.user.id;
            const projectId = parsePositiveInteger(req.params.id, 'id');

            const updatedProject = await projectService.updateProject(projectId, userId, req.body);
            return res.status(200).json({
                success: true,
                message: 'Projeto atualizado com sucesso!',
                data: updatedProject
            });
        } catch (error) {
            next(error);
        }
    }

    static async delete(req, res, next) {
        try {
            const userId = req.user.id;
            const projectId = parsePositiveInteger(req.params.id, 'id');

            await projectService.deleteProject(projectId, userId);
            return res.status(200).json({
                success: true,
                message: 'Projeto excluído com sucesso!'
            });
        } catch (error) {
            next(error);
        }
    }

    static async updateActivityStatus(req, res, next) {
        try {
            const userId = req.user.id;
            const projectId = parsePositiveInteger(req.params.projectId, 'projectId');
            const activityId = parsePositiveInteger(req.params.activityId, 'activityId');
            const { status } = req.body;

            const updatedProject = await projectService.updateActivityStatus(activityId, projectId, userId, status);
            return res.status(200).json({
                success: true,
                message: 'Status da etapa atualizado!',
                data: updatedProject
            });
        } catch (error) {
            next(error);
        }
    }

    static async getShares(req, res, next) {
        try {
            const userId = req.user.id;
            const projectId = parsePositiveInteger(req.params.id, 'id');
            const shares = await projectService.getProjectShares(projectId, userId);
            return res.status(200).json({
                success: true,
                data: shares
            });
        } catch (error) {
            next(error);
        }
    }

    static async share(req, res, next) {
        try {
            const userId = req.user.id;
            const projectId = parsePositiveInteger(req.params.id, 'id');
            const { email } = req.body;
            const result = await projectService.shareProject(projectId, userId, email);
            return res.status(200).json({
                success: true,
                message: result.message,
                data: result.user
            });
        } catch (error) {
            next(error);
        }
    }

    static async removeShare(req, res, next) {
        try {
            const userId = req.user.id;
            const projectId = parsePositiveInteger(req.params.id, 'id');
            const targetUserId = parsePositiveInteger(req.params.userId, 'userId');
            const result = await projectService.removeProjectShare(projectId, userId, targetUserId);
            return res.status(200).json({
                success: true,
                message: result.message
            });
        } catch (error) {
            next(error);
        }
    }

    static async sendEmail(req, res, next) {
        try {
            const userId = req.user.id;
            const projectId = parsePositiveInteger(req.params.id, 'id');
            const { recipientEmail, recipientName, note } = req.body;
            const result = await projectService.sendProjectByEmail(projectId, userId, recipientEmail, recipientName, note);
            return res.status(200).json({
                success: true,
                message: result.message
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = ProjectController;
