const ProjectService = require('../services/project.service');

const projectService = new ProjectService();

class ProjectController {
    static async list(req, res, next) {
        try {
            const userId = req.user.id;
            const { classification, type, status, search, deadline_status } = req.query;

            const result = await projectService.getProjects(userId, {
                classification,
                type,
                status,
                search,
                deadline_status
            });

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
            const projectId = Number(req.params.id);

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
            const projectId = Number(req.params.id);

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
            const projectId = Number(req.params.id);

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
            const projectId = Number(req.params.projectId);
            const activityId = Number(req.params.activityId);
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
            const projectId = Number(req.params.id);
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
            const projectId = Number(req.params.id);
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
            const projectId = Number(req.params.id);
            const targetUserId = Number(req.params.userId);
            const result = await projectService.removeProjectShare(projectId, userId, targetUserId);
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
