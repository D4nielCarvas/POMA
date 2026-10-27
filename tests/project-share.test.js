const test = require('node:test');
const assert = require('node:assert');
const { getDatabase } = require('../server/config/database');
const ProjectService = require('../server/services/project.service');
const AuthService = require('../server/services/auth.service');
const UserRepository = require('../server/models/user.repository');
const ProjectShareRepository = require('../server/models/project-share.repository');

test('Compartilhamento de Projetos e Controle de Acesso', async (t) => {
    const db = getDatabase(':memory:');
    const userRepo = new UserRepository(db, null);
    const shareRepo = new ProjectShareRepository(db, null);
    const authService = new AuthService(userRepo);
    const projectService = new ProjectService(null, null, null, null, null, shareRepo, userRepo);
    projectService.projectRepo.db = db;
    projectService.projectRepo.supabase = null;
    projectService.activityRepo.db = db;
    projectService.activityRepo.supabase = null;
    projectService.responsibleRepo.db = db;
    projectService.responsibleRepo.supabase = null;
    projectService.locationRepo.db = db;
    projectService.locationRepo.supabase = null;
    shareRepo.db = db;
    shareRepo.supabase = null;

    // 1. Cadastra dois usuários: Dono (Alice) e Convidado (Bob)
    const { user: alice } = await authService.register({
        name: 'Alice Criadora',
        email: 'alice@teste.com',
        password: 'password123'
    });

    const { user: bob } = await authService.register({
        name: 'Bob Convidado',
        email: 'bob@teste.com',
        password: 'password123'
    });

    let aliceProjectId = null;

    await t.test('1. Alice cria um projeto; Bob NÃO deve visualizá-lo inicialmente', async () => {
        const proj = await projectService.createProject(alice.id, {
            name: 'Projeto Secreto de Biocombustível',
            projectDate: '2026-10-27',
            classification: 'Experimento',
            type: 'Interno',
            objective: 'Pesquisa confidencial',
            location: 'Laboratório Central',
            startDate: '2026-10-27',
            endDate: '2026-12-31',
            responsibles: [{ name: 'Alice Criadora', email: 'alice@teste.com', phone: '1199999999' }],
            locations: ['Laboratório Central'],
            activities: [{ description: 'Etapa 1', target_date: '2026-11-15', status: 'Pendente' }]
        });

        aliceProjectId = proj.id;
        assert.ok(aliceProjectId, 'Projeto de Alice deve ter ID gerado');

        // Alice lista e vê seu projeto
        const aliceList = await projectService.getProjects(alice.id);
        assert.strictEqual(aliceList.projects.length, 1);
        assert.strictEqual(aliceList.projects[0].is_owner, true);
        assert.strictEqual(aliceList.projects[0].can_edit, true);

        // Bob lista e NÃO deve ver nada
        const bobList = await projectService.getProjects(bob.id);
        assert.strictEqual(bobList.projects.length, 0, 'Bob não deve ver projetos de Alice sem compartilhamento');
    });

    await t.test('2. Alice compartilha o projeto com Bob por e-mail', async () => {
        const shareResult = await projectService.shareProject(aliceProjectId, alice.id, 'bob@teste.com');
        assert.strictEqual(shareResult.success, true);
        assert.strictEqual(shareResult.user.email, 'bob@teste.com');

        // Bob agora deve enxergar o projeto na sua listagem
        const bobList = await projectService.getProjects(bob.id);
        assert.strictEqual(bobList.projects.length, 1, 'Bob agora deve visualizar o projeto compartilhado');
        assert.strictEqual(bobList.projects[0].id, aliceProjectId);
        assert.strictEqual(bobList.projects[0].is_owner, false, 'Bob NÃO deve ser o dono');
        assert.strictEqual(bobList.projects[0].can_edit, false, 'Bob NÃO deve poder editar');
        assert.strictEqual(bobList.projects[0].can_delete, false, 'Bob NÃO deve poder excluir');
        assert.strictEqual(bobList.projects[0].can_export, true, 'Bob DEVE poder exportar');
    });

    await t.test('3. Bob tenta editar o projeto compartilhado -> DEVE FALHAR (permissão negada)', async () => {
        await assert.rejects(
            async () => {
                await projectService.updateProject(aliceProjectId, bob.id, {
                    name: 'Nome alterado por Bob',
                    projectDate: '2026-10-27',
                    classification: 'Experimento',
                    type: 'Interno',
                    objective: 'Tentativa hacker',
                    location: 'Laboratório Central',
                    startDate: '2026-10-27',
                    endDate: '2026-12-31',
                    responsibles: [{ name: 'Bob', email: 'bob@teste.com', phone: '1199999999' }],
                    locations: ['Laboratório Central']
                });
            },
            /não possui permissão/i
        );
    });

    await t.test('4. Bob tenta excluir o projeto -> DEVE FALHAR (permissão negada)', async () => {
        await assert.rejects(
            async () => {
                await projectService.deleteProject(aliceProjectId, bob.id);
            },
            /permissão negada/i
        );
    });

    await t.test('5. Bob consegue visualizar os detalhes completos do projeto para exportação', async () => {
        const projectDetails = await projectService.getProjectById(aliceProjectId, bob.id);
        assert.strictEqual(projectDetails.id, aliceProjectId);
        assert.strictEqual(projectDetails.name, 'Projeto Secreto de Biocombustível');
        assert.strictEqual(projectDetails.can_export, true);
        assert.strictEqual(projectDetails.can_edit, false);
    });

    await t.test('6. Alice revoga o compartilhamento com Bob', async () => {
        await projectService.removeProjectShare(aliceProjectId, alice.id, bob.id);

        // Bob não deve mais visualizar o projeto
        const bobList = await projectService.getProjects(bob.id);
        assert.strictEqual(bobList.projects.length, 0, 'Projeto deve sumir da lista do Bob após revogação');

        // Acesso direto por ID também deve ser rejeitado
        await assert.rejects(
            async () => {
                await projectService.getProjectById(aliceProjectId, bob.id);
            },
            /permissão/i
        );
    });
});
