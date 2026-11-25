const express = require('express');
const ProjectController = require('../controllers/project.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { projectSchema, validateBody } = require('../validators/project.validator');

const router = express.Router();

// Todas as rotas de projetos exigem autenticação
router.use(authMiddleware);

router.get('/', ProjectController.list);
router.post('/', validateBody(projectSchema), ProjectController.create);
router.get('/:id', ProjectController.getById);
router.put('/:id', validateBody(projectSchema), ProjectController.update);
router.delete('/:id', ProjectController.delete);
router.patch('/:projectId/activities/:activityId', ProjectController.updateActivityStatus);

// Rotas de Compartilhamento de Projetos
router.get('/:id/shares', ProjectController.getShares);
router.post('/:id/shares', ProjectController.share);
router.delete('/:id/shares/:userId', ProjectController.removeShare);
router.post('/:id/send-email', ProjectController.sendEmail);

module.exports = router;
