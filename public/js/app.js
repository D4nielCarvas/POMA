/**
 * NEXUS PROJETOS - Core Application Controller
 */

// Estado global da aplicação cliente
const state = {
    currentUser: null,
    projects: [],
    metrics: { total: 0, active: 0, completed: 0, criticalAlerts: 0 },
    notifications: [],
    filters: {
        classification: '',
        type: '',
        deadline_status: '',
        search: ''
    },
    sort: 'end_date',          // 'end_date' | 'name_asc' | 'name_desc'
    currentView: 'grid',       // 'grid' | 'kanban' | 'calendar'
    calendarDate: new Date(),  // Data do mês atualmente focado no calendário
    pagination: {
        page: 1,
        pageSize: 6,
        totalPages: 1
    },
    editingProjectId: null,
    currentDetailProject: null,
    currentActivitiesProjectId: null,
    _cachedProjectForActivities: null, // cache para evitar round-trip extra em saveProjectActivitiesModal
    _dashboardDebounceTimer: null      // debounce para loadDashboard
};

// ==========================================================================
// GERENCIADOR DE TEMA (CLARO / ESCURO)
// ==========================================================================
const ThemeManager = {
    STORAGE_KEY: 'nexus_theme',
    DARK: 'dark',
    LIGHT: 'light',

    getCurrent() {
        return localStorage.getItem(this.STORAGE_KEY) || this.DARK;
    },

    apply(theme) {
        if (theme === this.LIGHT) {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        localStorage.setItem(this.STORAGE_KEY, theme);
        this.updateIcon(theme);
    },

    toggle() {
        const next = this.getCurrent() === this.DARK ? this.LIGHT : this.DARK;
        this.apply(next);
    },

    updateIcon(theme) {
        const isLight = theme === this.LIGHT;
        document.querySelectorAll('.theme-icon-dark').forEach(icon => {
            icon.style.display = isLight ? 'block' : 'none';
        });
        document.querySelectorAll('.theme-icon-light').forEach(icon => {
            icon.style.display = isLight ? 'none' : 'block';
        });
        const iconDark = document.getElementById('theme-icon-dark');
        const iconLight = document.getElementById('theme-icon-light');
        if (iconDark) iconDark.style.display = isLight ? 'block' : 'none';
        if (iconLight) iconLight.style.display = isLight ? 'none' : 'block';
    },

    init() {
        this.apply(this.getCurrent());
    }
};

// ==========================================================================
// INICIALIZAÇÃO DO SISTEMA
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
    initApp();
});

async function initApp() {
    bindGlobalEvents();

    // Detecta token de redefinição de senha na URL (vindo do link no e-mail)
    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('token');
    if (window.location.pathname === '/reset-password' && resetToken) {
        showResetPasswordView(resetToken);
        // Limpa a URL sem recarregar a página
        window.history.replaceState({}, '', '/');
        return;
    }

    checkAuthSession();

    // Redireciona para login automaticamente quando o token JWT expira
    window.addEventListener('auth:expired', () => {
        renderAuthView();
        Toast.show('Sua sessão expirou. Por favor, faça login novamente.', 'warning');
    });
}

function checkAuthSession() {
    if (api.isAuthenticated()) {
        state.currentUser = api.getUser();
        renderAuthenticatedUI();
        loadDashboard();
    } else {
        renderAuthView();
    }
}

// ==========================================================================
// RENDERIZAÇÃO DE TELAS & AUTENTICAÇÃO
// ==========================================================================
function renderAuthView() {
    document.getElementById('app-navbar').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('forgot-password-view').style.display = 'none';
    document.getElementById('reset-password-view').style.display = 'none';
    document.getElementById('auth-view').style.display = 'flex';
}

function showForgotPasswordView() {
    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('reset-password-view').style.display = 'none';
    document.getElementById('forgot-password-view').style.display = 'flex';
    // Limpa estado do formulário
    document.getElementById('forgot-form').reset();
    document.getElementById('forgot-subtitle').textContent = 'Informe seu e-mail e enviaremos as instruções de recuperação.';
}

function showResetPasswordView(token) {
    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('app-navbar').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('forgot-password-view').style.display = 'none';
    document.getElementById('reset-password-view').style.display = 'flex';
    // Armazena o token temporariamente para uso no submit
    document.getElementById('reset-form').dataset.token = token;
    document.getElementById('reset-form').reset();
}

function renderAuthenticatedUI() {
    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('app-navbar').style.display = 'flex';
    document.getElementById('dashboard-view').style.display = 'block';

    if (state.currentUser) {
        document.getElementById('user-display-name').textContent = state.currentUser.name;
        document.getElementById('user-display-email').textContent = state.currentUser.email;
        const initials = state.currentUser.name.trim().charAt(0).toUpperCase();
        document.getElementById('user-avatar-initials').textContent = initials || 'U';
        document.getElementById('greeting-title').textContent = `Olá, ${state.currentUser.name.split(' ')[0]}!`;
    }
}

// ==========================================================================
// CARREGAMENTO DO DASHBOARD E DADOS
// ==========================================================================

/**
 * Debounce para loadDashboard — evita múltiplas requisições em sequência
 * quando várias operações disparam a recarga em cascata.
 */
function scheduleDashboardReload(delayMs = 80) {
    clearTimeout(state._dashboardDebounceTimer);
    state._dashboardDebounceTimer = setTimeout(() => loadDashboard(), delayMs);
}

async function loadDashboard() {
    clearTimeout(state._dashboardDebounceTimer);
    try {
        const data = await api.getProjects(state.filters);
        state.projects = data.projects || [];
        state.metrics = data.metrics || { total: 0, active: 0, completed: 0, criticalAlerts: 0 };
        state.notifications = data.notifications || [];

        renderMetrics();
        renderNotificationsDropdown();
        renderProjectsGrid();
    } catch (error) {
        Toast.show(error.message, 'error');
    }
}

function renderMetrics() {
    document.getElementById('kpi-total').textContent = state.metrics.total;
    document.getElementById('kpi-active').textContent = state.metrics.active;
    document.getElementById('kpi-completed').textContent = state.metrics.completed;
    document.getElementById('kpi-critical').textContent = state.metrics.criticalAlerts;
}

function renderNotificationsDropdown() {
    const counter = document.getElementById('notification-counter');
    const headerCount = document.getElementById('notification-header-count');
    const listContainer = document.getElementById('notification-items-list');

    const totalAlerts = state.notifications.length;
    if (totalAlerts > 0) {
        counter.textContent = totalAlerts;
        counter.style.display = 'flex';
        headerCount.textContent = `${totalAlerts} ${totalAlerts === 1 ? 'alerta' : 'alertas'}`;
    } else {
        counter.style.display = 'none';
        headerCount.textContent = 'Nenhum alerta pendente';
    }

    if (totalAlerts === 0) {
        listContainer.innerHTML = `
            <div style="padding: 1.5rem 1rem; text-align: center; color: var(--color-text-muted); font-size: 0.85rem;">
                ✓ Todos os projetos e etapas estão no prazo!
            </div>
        `;
        return;
    }

    listContainer.innerHTML = state.notifications.map(notif => `
        <div class="notification-item urgency-${notif.urgency}" data-project-id="${notif.projectId}">
            <div class="notification-content">
                <h5>${escapeHtml(notif.title)}</h5>
                <p>${escapeHtml(notif.message)}</p>
            </div>
        </div>
    `).join('');

    // Adiciona clique para abrir detalhes do projeto direto da notificação
    listContainer.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', () => {
            const projectId = Number(item.dataset.projectId);
            document.getElementById('notification-dropdown').classList.remove('active');
            openProjectDetailsModal(projectId);
        });
    });
}

function renderProjectsGrid() {
    const grid = document.getElementById('projects-grid');

    if (state.projects.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="12" y1="18" x2="12" y2="12"></line>
                        <line x1="9" y1="15" x2="15" y2="15"></line>
                    </svg>
                </div>
                <h3>Nenhum projeto encontrado</h3>
                <p>Nenhum projeto atende aos filtros atuais ou você ainda não cadastrou seu primeiro projeto no sistema.</p>
                <button class="btn btn-primary" onclick="openCreateProjectModal()">
                    Cadastrar Primeiro Projeto
                </button>
            </div>
        `;
        return;
    }

    // Ordenação client-side (server retorna por end_date; aqui aplicamos a preferência do usuário)
    const sorted = [...state.projects];
    if (state.sort === 'name_asc') {
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
    } else if (state.sort === 'name_desc') {
        sorted.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'pt-BR', { sensitivity: 'base' }));
    }
    // 'end_date' mantém a ordem original do servidor (já ordenado por end_date ASC)

    // Paginação Client-Side para o Modo Grade
    const totalItems = sorted.length;
    const pageSize = state.pagination.pageSize;
    state.pagination.totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    
    // Garante que a página atual esteja dentro dos limites válidos
    if (state.pagination.page > state.pagination.totalPages) {
        state.pagination.page = state.pagination.totalPages;
    }
    if (state.pagination.page < 1) {
        state.pagination.page = 1;
    }

    const startIndex = (state.pagination.page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    const paginatedProjects = sorted.slice(startIndex, endIndex);

    grid.innerHTML = paginatedProjects.map(project => {
        const deadline = project.deadline_info || {};
        const activities = project.activities_summary || { total: 0, completed: 0 };
        const percentCompleted = activities.total > 0 
            ? Math.round((activities.completed / activities.total) * 100) 
            : (project.status === 'Concluído' ? 100 : 0);

        const startDateFmt = project.start_date ? project.start_date.split('-').reverse().join('/') : '-';
        const endDateFmt = project.end_date ? project.end_date.split('-').reverse().join('/') : '-';

        const isOwner = project.is_owner !== false;
        const creatorTag = !isOwner && project.creator_name 
            ? `<span class="tag" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:3px;vertical-align:text-top;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                Compartilhado por ${escapeHtml(project.creator_name.split(' ')[0])}
               </span>`
            : '';

        const ownerActionButtons = isOwner ? `
            <button class="btn btn-secondary btn-sm" onclick="openShareProjectModal(${project.id}, '${escapeHtml(project.name)}')" title="Compartilhar Projeto">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                <span>Compartilhar</span>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openEditProjectModal(${project.id})" title="Editar Projeto Completo">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                <span>Editar</span>
            </button>
            <button class="btn btn-danger btn-sm btn-icon-only" onclick="confirmDeleteProject(${project.id}, '${escapeHtml(project.name)}')" title="Excluir Projeto">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        ` : `
            <span class="readonly-badge" title="Você tem permissão apenas de visualização e exportação">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                Somente Leitura
            </span>
        `;

        return `
            <article class="project-card status-${deadline.status}">
                <div class="card-top">
                    <div class="card-tags">
                        <span class="tag tag-classification">${escapeHtml(project.classification)}</span>
                        <span class="tag tag-type">${escapeHtml(project.type)}</span>
                        ${creatorTag}
                        <span class="badge-deadline badge-${deadline.badgeColor}">${escapeHtml(deadline.label)}</span>
                    </div>

                    <h3 class="card-title">${escapeHtml(project.name)}</h3>
                    <p class="card-objective">${escapeHtmlMultiline(project.objective)}</p>

                    <div class="card-meta-list">
                        <div class="card-meta-item">
                            <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            <span>${escapeHtml(project.responsible_name)}</span>
                        </div>
                        <div class="card-meta-item">
                            <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            <span>${escapeHtml(project.location)}</span>
                        </div>
                        <div class="card-meta-item">
                            <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            <span>${startDateFmt} até ${endDateFmt}</span>
                        </div>
                    </div>

                    <div class="progress-container">
                        <div class="progress-header">
                            <span>Progresso do Cronograma</span>
                            <span>${activities.completed}/${activities.total} etapas (${percentCompleted}%)</span>
                        </div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" style="width: ${percentCompleted}%;"></div>
                        </div>
                    </div>
                </div>

                <div class="card-actions">
                    <!-- Linha 1: Ações de Consulta e Visualização (Grid balanceado) -->
                    <div class="card-actions-row row-view ${isOwner ? '' : 'cols-2'}">
                        <button class="btn btn-secondary btn-sm" onclick="openProjectDetailsModal(${project.id})" title="Ver Detalhes do Projeto">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                            <span>Detalhes</span>
                        </button>
                        ${isOwner ? `
                        <button class="btn btn-secondary btn-sm" onclick="openProjectActivitiesModal(${project.id})" title="Visualizar e Editar Etapas">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                            <span>Etapas</span>
                        </button>
                        ` : ''}
                        <button class="btn btn-secondary btn-sm" onclick="exportProjectToPdf(${project.id})" title="Exportar Projeto em PDF">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                            <span>Exportar</span>
                        </button>
                    </div>

                    <!-- Linha 2: Ações de Gestão / Propriedade -->
                    <div class="card-actions-row row-manage">
                        ${ownerActionButtons}
                    </div>
                </div>
            </article>
        `;
    }).join('');

    // Renderiza a barra de paginação do modo grade
    renderPaginationControls(totalItems, startIndex + 1, endIndex);

    // Também atualiza o Kanban e Calendário para sincronização
    renderKanbanBoard(sorted);
    renderCalendarView(sorted);
}

// ==========================================================================
// RENDERIZAÇÃO DOS CONTROLES DE PAGINAÇÃO
// ==========================================================================
function renderPaginationControls(totalItems, itemStart, itemEnd) {
    const container = document.getElementById('projects-pagination');
    if (!container) return;

    // Se estiver no modo Kanban ou sem projetos, oculta paginação
    if (state.currentView === 'kanban' || totalItems === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    const { page, totalPages, pageSize } = state.pagination;

    // Constrói botões numéricos
    let pageButtonsHtml = '';
    for (let i = 1; i <= totalPages; i++) {
        // Mostra a primeira, a última, e páginas próximas à atual
        if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
            pageButtonsHtml += `
                <button type="button" class="pagination-btn ${i === page ? 'active' : ''}" onclick="goToPage(${i})">
                    ${i}
                </button>
            `;
        } else if (i === page - 2 || i === page + 2) {
            pageButtonsHtml += `<span style="color: var(--color-text-secondary); padding: 0 4px;">...</span>`;
        }
    }

    container.innerHTML = `
        <div class="pagination-info">
            Exibindo <strong>${totalItems > 0 ? itemStart : 0}–${itemEnd}</strong> de <strong>${totalItems}</strong> projetos
        </div>
        <div class="pagination-controls">
            <button type="button" class="pagination-btn" onclick="goToPage(${page - 1})" ${page <= 1 ? 'disabled' : ''} title="Página Anterior">
                ‹
            </button>
            ${pageButtonsHtml}
            <button type="button" class="pagination-btn" onclick="goToPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''} title="Próxima Página">
                ›
            </button>
        </div>
    `;
}

function goToPage(newPage) {
    if (newPage < 1 || newPage > state.pagination.totalPages || newPage === state.pagination.page) return;
    state.pagination.page = newPage;
    renderProjectsGrid();
    // Suave scroll para o topo da lista de projetos
    document.getElementById('projects-grid')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ==========================================================================
// RENDERIZAÇÃO DO QUADRO KANBAN
// ==========================================================================
function renderKanbanBoard(projectsList = state.projects) {
    const kanbanContainer = document.getElementById('projects-kanban');
    if (!kanbanContainer) return;

    const columns = [
        { id: 'Pendente', title: 'Pendente', icon: '⏳' },
        { id: 'Em Andamento', title: 'Em Andamento', icon: '🚀' },
        { id: 'Concluído', title: 'Concluído', icon: '✅' },
        { id: 'Cancelado', title: 'Cancelado', icon: '🚫' }
    ];

    kanbanContainer.innerHTML = columns.map(col => {
        const colProjects = projectsList.filter(p => (p.status || 'Em Andamento') === col.id);
        return `
            <div class="kanban-column" data-status="${col.id}">
                <div class="kanban-column-header">
                    <span class="kanban-column-title">
                        <span>${col.icon}</span>
                        <span>${col.title}</span>
                    </span>
                    <span class="kanban-badge-count">${colProjects.length}</span>
                </div>
                <div class="kanban-cards-container" data-status="${col.id}">
                    ${colProjects.map(p => {
                        const deadline = p.deadline_info || {};
                        const activities = p.activities_summary || { total: 0, completed: 0 };
                        return `
                            <div class="kanban-card" draggable="${p.can_edit !== false}" data-project-id="${p.id}">
                                <div class="card-tags" style="margin-bottom: 0.35rem;">
                                    <span class="badge-deadline badge-${deadline.badgeColor || 'info'}" style="font-size: 0.7rem; padding: 2px 6px;">
                                        ${escapeHtml(deadline.label || p.status)}
                                    </span>
                                </div>
                                <div class="kanban-card-title">${escapeHtml(p.name)}</div>
                                <div class="kanban-card-meta">
                                    <span>👤 ${escapeHtml(p.responsible_name || 'Sem responsável')}</span>
                                    <span>📍 ${escapeHtml(p.location || 'Sem local')}</span>
                                    <span>📅 Término: ${p.end_date ? p.end_date.split('-').reverse().join('/') : '-'}</span>
                                    <span style="font-weight: 500; color: var(--color-primary-500);">✓ ${activities.completed}/${activities.total} etapas concluídas</span>
                                </div>
                                <div style="display: flex; gap: 4px; margin-top: 0.6rem; justify-content: flex-end;">
                                    <button class="btn btn-secondary btn-sm" onclick="openProjectDetailsModal(${p.id})" style="padding: 2px 8px; font-size: 0.72rem;">Detalhes</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');

    bindKanbanDragAndDrop();
}

function bindKanbanDragAndDrop() {
    const cards = document.querySelectorAll('.kanban-card[draggable="true"]');
    const containers = document.querySelectorAll('.kanban-cards-container');

    cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', card.dataset.projectId);
            e.dataTransfer.effectAllowed = 'move';
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });
    });

    containers.forEach(container => {
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            container.classList.add('drag-over');
        });

        container.addEventListener('dragleave', () => {
            container.classList.remove('drag-over');
        });

        container.addEventListener('drop', async (e) => {
            e.preventDefault();
            container.classList.remove('drag-over');
            const projectId = Number(e.dataTransfer.getData('text/plain'));
            const newStatus = container.dataset.status;

            const project = state.projects.find(p => p.id === projectId);
            if (!project || project.status === newStatus) return;

            try {
                // Atualização otimista no estado local
                project.status = newStatus;
                renderProjectsGrid();

                // Monta payload completo para update
                const payload = {
                    name: project.name,
                    classification: project.classification,
                    type: project.type,
                    projectDate: project.project_date,
                    startDate: project.start_date,
                    endDate: project.end_date,
                    objective: project.objective,
                    evaluationAnalysis: project.evaluation_analysis,
                    status: newStatus,
                    responsibles: project.responsibles && project.responsibles.length > 0 
                        ? project.responsibles 
                        : [{ name: project.responsible_name, email: project.responsible_email, phone: project.responsible_phone }],
                    locations: project.locations ? project.locations.map(l => typeof l === 'string' ? l : l.name) : [project.location],
                    activities: project.activities || []
                };

                await api.updateProject(projectId, payload);
                Toast.show(`Status alterado para "${newStatus}"!`, 'success');
                scheduleDashboardReload(300);
            } catch (err) {
                Toast.show(`Erro ao alterar status: ${err.message}`, 'error');
                scheduleDashboardReload(100);
            }
        });
    });
}

// ==========================================================================
// EXPORTAÇÃO ANALÍTICA PARA CSV (EXCEL)
// ==========================================================================
function exportProjectsToCSV() {
    if (!state.projects || state.projects.length === 0) {
        Toast.show('Nenhum projeto disponível para exportação com os filtros atuais.', 'warning');
        return;
    }

    const headers = [
        'ID',
        'Nome do Projeto',
        'Classificacao',
        'Tipo',
        'Status',
        'Situacao Prazo',
        'Data Inicio',
        'Data Termino',
        'Responsavel Principal',
        'Email Responsavel',
        'Local Principal',
        'Total Etapas',
        'Etapas Concluidas',
        'Progresso %',
        'Objetivo'
    ];

    const escapeCsv = (str) => {
        if (str === null || str === undefined) return '""';
        const formatted = String(str).replace(/"/g, '""').replace(/\r?\n/g, ' ');
        return `"${formatted}"`;
    };

    const rows = state.projects.map(p => {
        const activities = p.activities_summary || { total: 0, completed: 0 };
        const percent = activities.total > 0 ? Math.round((activities.completed / activities.total) * 100) : (p.status === 'Concluído' ? 100 : 0);
        const deadline = p.deadline_info || {};

        return [
            p.id,
            escapeCsv(p.name),
            escapeCsv(p.classification),
            escapeCsv(p.type),
            escapeCsv(p.status),
            escapeCsv(deadline.label || '-'),
            escapeCsv(p.start_date),
            escapeCsv(p.end_date),
            escapeCsv(p.responsible_name),
            escapeCsv(p.responsible_email),
            escapeCsv(p.location),
            activities.total,
            activities.completed,
            `${percent}%`,
            escapeCsv(p.objective)
        ].join(';');
    });

    // Inclusão do BOM (Byte Order Mark) para garantir compatibilidade com UTF-8 no Microsoft Excel
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_projetos_poma_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    Toast.show('Relatório analítico exportado em CSV com sucesso!', 'success');
}

// ==========================================================================
// RENDERIZAÇÃO DO CALENDÁRIO MENSAL (GOOGLE CALENDAR STYLE)
// ==========================================================================
function renderCalendarView(projectsList = state.projects) {
    const calendarContainer = document.getElementById('projects-calendar');
    const daysContainer = document.getElementById('calendar-days-cells');
    const monthLabel = document.getElementById('calendar-current-month-label');
    if (!calendarContainer || !daysContainer || !monthLabel) return;

    const focusedDate = state.calendarDate instanceof Date ? state.calendarDate : new Date();
    const year = focusedDate.getFullYear();
    const month = focusedDate.getMonth(); // 0-indexed (0 = Jan, 10 = Nov)

    // Formata o título: "Novembro de 2026"
    const monthName = focusedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    monthLabel.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    // Mapeamento de todas as etapas e datas limite de projetos por data (YYYY-MM-DD)
    const eventsByDate = new Map();

    const addEventToDate = (dateKey, eventObj) => {
        if (!dateKey) return;
        const normalizedKey = dateKey.split('T')[0];
        if (!eventsByDate.has(normalizedKey)) {
            eventsByDate.set(normalizedKey, []);
        }
        eventsByDate.get(normalizedKey).push(eventObj);
    };

    const todayStr = new Date().toISOString().split('T')[0];

    projectsList.forEach(project => {
        // 1. Etapas do cronograma
        if (Array.isArray(project.activities)) {
            project.activities.forEach(act => {
                const actDate = act.target_date || act.targetDate;
                if (!actDate) return;

                let statusClass = 'status-pendente';
                const actStatus = act.status || 'Pendente';
                if (actStatus === 'Concluída') {
                    statusClass = 'status-concluida';
                } else if (actStatus === 'Em Andamento') {
                    statusClass = 'status-andamento';
                } else if (actDate < todayStr && actStatus !== 'Concluída') {
                    statusClass = 'status-atrasada';
                }

                addEventToDate(actDate, {
                    type: 'activity',
                    activityId: act.id,
                    title: act.description,
                    projectName: project.name,
                    projectId: project.id,
                    status: actStatus,
                    statusClass: statusClass,
                    date: actDate,
                    canEdit: project.can_edit !== false
                });
            });
        }

        // 2. Data de término do projeto como marco importante
        if (project.end_date) {
            const isCompleted = project.status === 'Concluído';
            const isOverdue = project.end_date < todayStr && !isCompleted;
            let statusClass = isCompleted ? 'status-concluida' : (isOverdue ? 'status-atrasada' : 'status-andamento');

            addEventToDate(project.end_date, {
                type: 'project_end',
                title: `Fim: ${project.name}`,
                projectName: project.name,
                projectId: project.id,
                status: project.status,
                statusClass: statusClass,
                date: project.end_date,
                canEdit: false
            });
        }
    });

    // Construção das células do calendário (dias da semana iniciam em Domingo: 0 a 6)
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Dom, 1 = Seg, ...
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    // 6 semanas x 7 dias = 42 células para grade perfeita e estável
    const totalCells = 42;
    let daysHtml = '';

    const pad = (n) => String(n).padStart(2, '0');

    // Abreviações dos meses para o primeiro dia de cada mês (ex: "1 nov.", "1 dez.")
    const monthAbbr = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

    for (let i = 0; i < totalCells; i++) {
        let cellYear = year;
        let cellMonth = month;
        let dayNum = 0;
        let isOtherMonth = false;

        if (i < firstDayOfMonth) {
            // Dias do mês anterior
            isOtherMonth = true;
            dayNum = daysInPrevMonth - (firstDayOfMonth - 1 - i);
            cellMonth = month - 1;
            if (cellMonth < 0) {
                cellMonth = 11;
                cellYear = year - 1;
            }
        } else if (i >= firstDayOfMonth + daysInCurrentMonth) {
            // Dias do próximo mês
            isOtherMonth = true;
            dayNum = i - (firstDayOfMonth + daysInCurrentMonth) + 1;
            cellMonth = month + 1;
            if (cellMonth > 11) {
                cellMonth = 0;
                cellYear = year + 1;
            }
        } else {
            // Dias do mês corrente
            dayNum = i - firstDayOfMonth + 1;
        }

        const dateKey = `${cellYear}-${pad(cellMonth + 1)}-${pad(dayNum)}`;
        const isToday = dateKey === todayStr;
        const cellEvents = eventsByDate.get(dateKey) || [];

        // Rótulo especial quando for dia 1 de qualquer mês (ex: "1 nov.")
        const dayLabelSub = dayNum === 1 ? `<span class="day-month-sub">${monthAbbr[cellMonth]}</span>` : '';

        // Limita exibição inicial a 3 eventos para não estourar a célula
        const maxVisible = 3;
        const visibleEvents = cellEvents.slice(0, maxVisible);
        const remainingCount = cellEvents.length - maxVisible;

        const eventsHtml = visibleEvents.map(ev => {
            // Limita o texto exibido a no máximo 26 caracteres para manter leitura limpa dentro da célula do dia
            const rawTitle = ev.title || '';
            const displayTitle = rawTitle.length > 26 ? rawTitle.substring(0, 24) + '...' : rawTitle;
            const isActivity = ev.type === 'activity';
            const isDraggable = isActivity && ev.canEdit !== false;

            return `
                <div class="cal-event-pill ${ev.statusClass} ${isDraggable ? 'draggable-cal-event' : ''}" 
                     draggable="${isDraggable ? 'true' : 'false'}"
                     data-event-type="${ev.type}"
                     data-project-id="${ev.projectId}"
                     data-activity-id="${ev.activityId || ''}"
                     data-activity-desc="${encodeURIComponent(ev.title || '')}"
                     data-activity-date="${ev.date}"
                     data-activity-status="${ev.status}"
                     onclick="handleCalendarEventClick(event, ${ev.projectId})" 
                     title="[${escapeHtml(ev.projectName)}] ${escapeHtml(ev.title)} (${ev.status})${isDraggable ? ' - Arraste para mover de dia' : ''}">
                    <span class="cal-event-project-dot"></span>
                    <span class="cal-event-title-text">${escapeHtml(displayTitle)}</span>
                </div>
            `;
        }).join('');

        const moreBtnHtml = remainingCount > 0 
            ? `<button type="button" class="cal-more-events-btn" onclick="handleCalendarMoreBtnClick(event, '${dateKey}')">+ mais ${remainingCount}</button>` 
            : '';

        daysHtml += `
            <div class="calendar-day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'is-today' : ''}" data-date="${dateKey}" title="Clique no dia para cadastrar projeto ou etapa">
                <div class="calendar-day-header">
                    <span class="day-number">${dayNum}</span>
                    ${dayLabelSub}
                </div>
                <div class="calendar-events-list">
                    ${eventsHtml}
                    ${moreBtnHtml}
                </div>
            </div>
        `;
    }

    daysContainer.innerHTML = daysHtml;
    bindCalendarEventsAndDragDrop();
}

// Interceptadores de clique em eventos do calendário para não propagar ao clique no dia
function handleCalendarEventClick(event, projectId) {
    if (event) event.stopPropagation();
    openProjectDetailsModal(projectId);
}

function handleCalendarMoreBtnClick(event, dateKey) {
    if (event) event.stopPropagation();
    openCalendarDayEventsModal(dateKey);
}

// Navegação de Meses
function navigateCalendar(offsetMonths) {
    const cur = state.calendarDate instanceof Date ? state.calendarDate : new Date();
    state.calendarDate = new Date(cur.getFullYear(), cur.getMonth() + offsetMonths, 1);
    renderCalendarView();
}

function resetCalendarToToday() {
    state.calendarDate = new Date();
    renderCalendarView();
}

// Modal ou visualização de detalhes ao clicar em "+ mais X" em um dia
function openCalendarDayEventsModal(dateKey) {
    const dayProjects = [];
    state.projects.forEach(p => {
        const matchesActivity = (p.activities || []).some(a => (a.target_date || a.targetDate) === dateKey);
        const matchesEnd = p.end_date === dateKey;
        if (matchesActivity || matchesEnd) {
            dayProjects.push(p);
        }
    });

    if (dayProjects.length > 0) {
        openProjectDetailsModal(dayProjects[0].id);
    }
}

// ==========================================================================
// DRAG & DROP E INTERAÇÕES DO CALENDÁRIO MENSAL
// ==========================================================================
function bindCalendarEventsAndDragDrop() {
    const cells = document.querySelectorAll('.calendar-day-cell');
    cells.forEach(cell => {
        // 1. Clique no quadrado do dia para criar Novo Projeto ou Atividade
        cell.addEventListener('click', (e) => {
            // Se o clique foi numa pílula de evento ou no botão de "+ mais X", não abre o quick add
            if (e.target.closest('.cal-event-pill') || e.target.closest('.cal-more-events-btn')) {
                return;
            }
            const dateKey = cell.dataset.date;
            if (dateKey) {
                openCalendarQuickAddModal(dateKey);
            }
        });

        // 2. Eventos de Drop Target na célula do dia
        cell.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            cell.classList.add('drag-over-day');
        });

        cell.addEventListener('dragleave', (e) => {
            if (!cell.contains(e.relatedTarget)) {
                cell.classList.remove('drag-over-day');
            }
        });

        cell.addEventListener('drop', async (e) => {
            e.preventDefault();
            cell.classList.remove('drag-over-day');

            let dragData = null;
            try {
                const rawJson = e.dataTransfer.getData('application/json');
                if (rawJson) {
                    dragData = JSON.parse(rawJson);
                }
            } catch (err) {
                console.error('Falha ao parsear drag data do calendário:', err);
                return;
            }

            if (!dragData || dragData.type !== 'activity') return;

            const targetDate = cell.dataset.date;
            if (!targetDate || targetDate === dragData.date) {
                return; // Mesma data, nenhuma alteração
            }

            await handleMoveActivityDate(dragData.projectId, dragData.activityId, dragData.description, dragData.date, targetDate);
        });
    });

    // 3. Eventos de Drag Source nas pílulas de atividade
    const draggablePills = document.querySelectorAll('.cal-event-pill.draggable-cal-event');
    draggablePills.forEach(pill => {
        pill.addEventListener('dragstart', (e) => {
            pill.classList.add('dragging');
            const dragPayload = {
                type: 'activity',
                projectId: pill.dataset.projectId,
                activityId: pill.dataset.activityId,
                description: decodeURIComponent(pill.dataset.activityDesc || ''),
                date: pill.dataset.activityDate,
                status: pill.dataset.activityStatus
            };
            e.dataTransfer.setData('application/json', JSON.stringify(dragPayload));
            e.dataTransfer.effectAllowed = 'move';
        });

        pill.addEventListener('dragend', () => {
            pill.classList.remove('dragging');
            document.querySelectorAll('.calendar-day-cell.drag-over-day').forEach(c => c.classList.remove('drag-over-day'));
        });
    });
}

// Altera a data de uma atividade ao ser arrastada e solta em outro dia
async function handleMoveActivityDate(projectId, activityId, description, oldDate, newDate) {
    const projId = Number(projectId);
    const project = state.projects.find(p => p.id === projId);

    if (!project) {
        Toast.show('Projeto não localizado.', 'error');
        return;
    }

    if (project.can_edit === false) {
        Toast.show('Você não possui permissão para editar atividades deste projeto.', 'warning');
        return;
    }

    try {
        // Carrega o projeto completo para garantir lista de atividades atualizada
        let fullProject = state._cachedProjectForActivities && state._cachedProjectForActivities.id === projId
            ? state._cachedProjectForActivities
            : null;
        if (!fullProject) {
            fullProject = await api.getProjectById(projId);
        }

        const activities = Array.isArray(fullProject.activities) ? JSON.parse(JSON.stringify(fullProject.activities)) : [];
        let updated = false;

        for (let act of activities) {
            const actIdMatch = activityId && act.id && String(act.id) === String(activityId);
            const actDescMatch = act.description === description && ((act.target_date || act.targetDate) === oldDate);

            if (actIdMatch || actDescMatch) {
                act.target_date = newDate;
                delete act.targetDate;
                updated = true;
                break;
            }
        }

        if (!updated) {
            Toast.show('Etapa não encontrada no projeto para reescalonamento.', 'warning');
            return;
        }

        // Mantém consistência temporal de datas de início e fim no validador
        let newEndDate = fullProject.end_date;
        let newStartDate = fullProject.start_date;
        if (newDate > newEndDate) {
            newEndDate = newDate;
        }
        if (newDate < newStartDate) {
            newStartDate = newDate;
        }

        const payload = {
            name: fullProject.name,
            classification: fullProject.classification,
            type: fullProject.type,
            projectDate: fullProject.project_date,
            startDate: newStartDate,
            endDate: newEndDate,
            objective: fullProject.objective,
            evaluationAnalysis: fullProject.evaluation_analysis || null,
            status: fullProject.status,
            responsibles: fullProject.responsibles && fullProject.responsibles.length > 0
                ? fullProject.responsibles
                : [{ name: fullProject.responsible_name, email: fullProject.responsible_email, phone: fullProject.responsible_phone }],
            locations: fullProject.locations && fullProject.locations.length > 0
                ? fullProject.locations.map(l => typeof l === 'string' ? l : l.name)
                : [fullProject.location],
            activities: activities.map(a => ({
                description: a.description,
                target_date: a.target_date,
                status: a.status || 'Pendente'
            }))
        };

        await api.updateProject(projId, payload);
        const formattedNewDate = newDate.split('-').reverse().join('/');
        Toast.show(`Etapa reagendada para ${formattedNewDate} com sucesso!`, 'success');
        scheduleDashboardReload(200);
    } catch (error) {
        Toast.show(`Erro ao mover etapa: ${error.message}`, 'error');
        scheduleDashboardReload(500);
    }
}

// ==========================================================================
// MODAL DE CRIAÇÃO RÁPIDA NO CALENDÁRIO (PROJETO OU ATIVIDADE)
// ==========================================================================
let currentQuickAddDate = null;

function openCalendarQuickAddModal(dateKey) {
    currentQuickAddDate = dateKey;
    const parts = dateKey.split('-');
    const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;

    const titleEl = document.getElementById('quick-add-modal-title');
    const badgeEl = document.getElementById('quick-add-badge-date');
    const hiddenDate = document.getElementById('quick-act-date');
    const displayDate = document.getElementById('quick-act-display-date');
    const projectSelect = document.getElementById('quick-act-project-select');
    const descInput = document.getElementById('quick-act-desc');
    const statusSelect = document.getElementById('quick-act-status');
    const submitBtn = document.getElementById('btn-submit-quick-act');

    if (titleEl) titleEl.textContent = `Novo Registro - ${formattedDate}`;
    if (badgeEl) badgeEl.textContent = formattedDate;
    if (hiddenDate) hiddenDate.value = dateKey;
    if (displayDate) displayDate.value = dateKey;
    if (descInput) descInput.value = '';
    if (statusSelect) statusSelect.value = 'Pendente';

    // Carrega projetos editáveis
    if (projectSelect) {
        const editableProjects = (state.projects || []).filter(p => p.can_edit !== false);
        if (editableProjects.length === 0) {
            projectSelect.innerHTML = '<option value="">Nenhum projeto editável encontrado</option>';
            projectSelect.disabled = true;
            if (descInput) descInput.disabled = true;
            if (submitBtn) submitBtn.disabled = true;
        } else {
            projectSelect.disabled = false;
            if (descInput) descInput.disabled = false;
            if (submitBtn) submitBtn.disabled = false;
            projectSelect.innerHTML = '<option value="">Selecione o projeto...</option>' +
                editableProjects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
        }
    }

    const modal = document.getElementById('modal-calendar-quick-add');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function closeCalendarQuickAddModal() {
    const modal = document.getElementById('modal-calendar-quick-add');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    currentQuickAddDate = null;
}

async function handleQuickAddActivity(e) {
    e.preventDefault();
    const projectId = document.getElementById('quick-act-project-select').value;
    const description = document.getElementById('quick-act-desc').value.trim();
    const targetDate = document.getElementById('quick-act-display-date').value || document.getElementById('quick-act-date').value;
    const status = document.getElementById('quick-act-status').value || 'Pendente';

    if (!projectId) {
        Toast.show('Selecione o projeto de destino para a etapa.', 'warning');
        return;
    }
    if (!description) {
        Toast.show('Informe a descrição da etapa.', 'warning');
        return;
    }
    if (!targetDate) {
        Toast.show('Informe a data prevista para a etapa.', 'warning');
        return;
    }

    const submitBtn = document.getElementById('btn-submit-quick-act');
    const originalText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Adicionando...</span>';
    }

    try {
        const fullProject = await api.getProjectById(projectId);
        const activities = Array.isArray(fullProject.activities) ? [...fullProject.activities] : [];

        activities.push({
            description: description,
            target_date: targetDate,
            status: status
        });

        let newStartDate = fullProject.start_date;
        let newEndDate = fullProject.end_date;
        if (targetDate > newEndDate) newEndDate = targetDate;
        if (targetDate < newStartDate) newStartDate = targetDate;

        const payload = {
            name: fullProject.name,
            classification: fullProject.classification,
            type: fullProject.type,
            projectDate: fullProject.project_date,
            startDate: newStartDate,
            endDate: newEndDate,
            objective: fullProject.objective,
            evaluationAnalysis: fullProject.evaluation_analysis || null,
            status: fullProject.status,
            responsibles: fullProject.responsibles && fullProject.responsibles.length > 0
                ? fullProject.responsibles
                : [{ name: fullProject.responsible_name, email: fullProject.responsible_email, phone: fullProject.responsible_phone }],
            locations: fullProject.locations && fullProject.locations.length > 0
                ? fullProject.locations.map(l => typeof l === 'string' ? l : l.name)
                : [fullProject.location],
            activities: activities.map(a => ({
                description: a.description,
                target_date: a.target_date || a.targetDate,
                status: a.status || 'Pendente'
            }))
        };

        await api.updateProject(projectId, payload);
        Toast.show('Etapa adicionada com sucesso ao cronograma!', 'success');
        closeCalendarQuickAddModal();
        scheduleDashboardReload(200);
    } catch (error) {
        Toast.show(`Falha ao adicionar etapa: ${error.message}`, 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
}

// ==========================================================================
// MODAL DE CADASTRO / EDIÇÃO DE PROJETO
// ==========================================================================
function openCreateProjectModal(prefillDate = null) {
    state.editingProjectId = null;
    document.getElementById('project-modal-title').textContent = 'Novo Projeto';
    document.getElementById('project-form').reset();
    document.getElementById('project-id-input').value = '';

    // Data padrão: usa prefillDate se fornecido ou a data de hoje
    const targetDate = prefillDate || new Date().toISOString().split('T')[0];
    document.getElementById('proj-date').value = targetDate;
    document.getElementById('proj-start-date').value = targetDate;
    document.getElementById('proj-end-date').value = targetDate;

    // Inicializa containers dinâmicos
    document.getElementById('responsibles-container').innerHTML = '';
    addResponsibleRow();

    document.getElementById('locations-container').innerHTML = '';
    addLocationRow();

    const scheduleContainer = document.getElementById('schedule-rows-container');
    scheduleContainer.innerHTML = '';
    addScheduleRow({ target_date: targetDate });

    document.getElementById('project-modal-overlay').classList.add('active');
}

async function openEditProjectModal(projectId) {
    try {
        state.editingProjectId = projectId;
        document.getElementById('project-modal-title').textContent = 'Editar Projeto';
        const project = await api.getProjectById(projectId);

        document.getElementById('project-id-input').value = project.id;
        document.getElementById('proj-name').value = project.name;
        document.getElementById('proj-date').value = project.project_date;
        document.getElementById('proj-classification').value = project.classification;
        document.getElementById('proj-type').value = project.type;
        document.getElementById('proj-objective').value = project.objective;
        document.getElementById('proj-start-date').value = project.start_date;
        document.getElementById('proj-end-date').value = project.end_date;
        document.getElementById('proj-evaluation').value = project.evaluation_analysis || '';

        // Preenche responsáveis
        const respsContainer = document.getElementById('responsibles-container');
        respsContainer.innerHTML = '';
        const responsibles = project.responsibles && project.responsibles.length > 0
            ? project.responsibles
            : [{ name: project.responsible_name, email: project.responsible_email, phone: project.responsible_phone }];
        responsibles.forEach(resp => addResponsibleRow(resp));

        // Preenche locais
        const locsContainer = document.getElementById('locations-container');
        locsContainer.innerHTML = '';
        const locations = project.locations && project.locations.length > 0
            ? project.locations
            : [{ name: project.location }];
        locations.forEach(loc => addLocationRow(loc));

        // Preenche etapas do cronograma
        const scheduleContainer = document.getElementById('schedule-rows-container');
        scheduleContainer.innerHTML = '';
        if (Array.isArray(project.activities) && project.activities.length > 0) {
            project.activities.forEach(act => addScheduleRow(act));
        } else {
            addScheduleRow();
        }

        document.getElementById('project-modal-overlay').classList.add('active');
    } catch (error) {
        Toast.show(error.message, 'error');
    }
}

function closeProjectModal() {
    document.getElementById('project-modal-overlay').classList.remove('active');
    state.editingProjectId = null;
}

// Adiciona linha de responsável dinâmico
function addResponsibleRow(data = null) {
    const container = document.getElementById('responsibles-container');
    const rowId = `resp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    const name = data ? (data.name || '') : '';
    const email = data ? (data.email || '') : '';
    const phone = data ? (data.phone || '') : '';

    const row = document.createElement('div');
    row.className = 'schedule-row';
    row.id = rowId;
    row.style.gridTemplateColumns = '1fr 1fr 1fr 42px';
    row.innerHTML = `
        <div>
            <input type="text" class="form-input resp-name" placeholder="Nome do Responsável *" value="${escapeHtml(name)}">
        </div>
        <div>
            <input type="email" class="form-input resp-email" placeholder="email@instituicao.com *" value="${escapeHtml(email)}">
        </div>
        <div>
            <input type="tel" class="form-input resp-phone" placeholder="(11) 99999-0000 *" value="${escapeHtml(phone)}">
        </div>
        <div>
            <button type="button" class="btn-remove-step" title="Remover Responsável">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        </div>
    `;

    row.querySelector('.btn-remove-step').addEventListener('click', () => {
        if (container.querySelectorAll('.schedule-row').length > 1) {
            container.removeChild(row);
        } else {
            Toast.show('O projeto deve ter ao menos um responsável.', 'warning');
        }
    });

    // Máscara dinâmica para o telefone
    row.querySelector('.resp-phone').addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 11) val = val.substring(0, 11);
        if (val.length > 10) val = val.replace(/^(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        else if (val.length > 6) val = val.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
        else if (val.length > 2) val = val.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
        e.target.value = val;
    });

    container.appendChild(row);
}

// Adiciona linha de local de execução dinâmico
function addLocationRow(data = null) {
    const container = document.getElementById('locations-container');
    const rowId = `loc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    const name = data ? (typeof data === 'string' ? data : (data.name || '')) : '';

    const row = document.createElement('div');
    row.className = 'schedule-row';
    row.id = rowId;
    row.style.gridTemplateColumns = '1fr 42px';
    row.innerHTML = `
        <div>
            <input type="text" class="form-input loc-name" placeholder="Ex: Laboratório Central - Bloco 3" value="${escapeHtml(name)}">
        </div>
        <div>
            <button type="button" class="btn-remove-step" title="Remover Local">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        </div>
    `;

    row.querySelector('.btn-remove-step').addEventListener('click', () => {
        if (container.querySelectorAll('.schedule-row').length > 1) {
            container.removeChild(row);
        } else {
            Toast.show('O projeto deve ter ao menos um local de execução.', 'warning');
        }
    });

    container.appendChild(row);
}

function addScheduleRow(data = null) {
    const container = document.getElementById('schedule-rows-container');
    const rowId = `row-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    const description = data ? (data.description || '') : '';
    const targetDate = data ? (data.target_date || data.targetDate || data.date || '') : '';
    const status = data ? (data.status || 'Pendente') : 'Pendente';

    const row = document.createElement('div');
    row.className = 'schedule-row';
    row.id = rowId;
    row.innerHTML = `
        <div>
            <input type="text" class="form-input activity-desc" placeholder="Descrição da Etapa..." value="${escapeHtml(description)}" required>
        </div>
        <div>
            <input type="date" class="form-input activity-date" value="${targetDate}" required>
        </div>
        <div>
            <select class="form-select activity-status">
                <option value="Pendente" ${status === 'Pendente' ? 'selected' : ''}>Pendente</option>
                <option value="Em Andamento" ${status === 'Em Andamento' ? 'selected' : ''}>Em Andamento</option>
                <option value="Concluída" ${status === 'Concluída' ? 'selected' : ''}>Concluída</option>
            </select>
        </div>
        <div>
            <button type="button" class="btn-remove-step" title="Remover Etapa">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        </div>
    `;

    row.querySelector('.btn-remove-step').addEventListener('click', () => {
        container.removeChild(row);
    });

    container.appendChild(row);
}

// ==========================================================================
// MODAL DE DETALHES DO PROJETO & TIMELINE VISUAL
// ==========================================================================
async function openProjectDetailsModal(projectId) {
    try {
        const project = await api.getProjectById(projectId);
        state.currentDetailProject = project;
        // Pré-popula o cache de atividades para evitar round-trip ao abrir o modal de etapas
        state._cachedProjectForActivities = project;

        document.getElementById('details-modal-name').textContent = project.name;
        
        // Tags
        const deadline = project.deadline_info || {};
        document.getElementById('details-modal-tags').innerHTML = `
            <span class="tag tag-classification">${escapeHtml(project.classification)}</span>
            <span class="tag tag-type">${escapeHtml(project.type)}</span>
            <span class="badge-deadline badge-${deadline.badgeColor}">${escapeHtml(deadline.label)}</span>
        `;

        // Banner de Alerta Crítico
        const banner = document.getElementById('details-alert-banner');
        banner.className = `details-alert-banner urgency-${deadline.status}`;
        banner.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div>
                <strong>${deadline.status === 'atrasado' ? 'Atenção Crítica: ' : 'Situação do Prazo: '}</strong>
                ${escapeHtml(deadline.message)}
            </div>
        `;

        // Informações de responsáveis com cards dedicados e dados de contato organizados
        const respList = document.getElementById('details-resp-list');
        const responsibles = project.responsibles && project.responsibles.length > 0
            ? project.responsibles
            : [{ name: project.responsible_name, email: project.responsible_email, phone: project.responsible_phone }];

        respList.innerHTML = responsibles.map(r => {
            const initials = r.name ? r.name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'R';
            return `
                <div class="resp-detail-card">
                    <div class="resp-avatar-badge">${initials}</div>
                    <div class="resp-info-block">
                        <div class="resp-name-title">${escapeHtml(r.name || 'Responsável não informado')}</div>
                        <div class="resp-contact-items">
                            ${r.email ? `
                                <div class="resp-contact-pill">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                    <a href="mailto:${escapeHtml(r.email)}" title="Enviar e-mail">${escapeHtml(r.email)}</a>
                                </div>
                            ` : ''}
                            ${r.phone ? `
                                <div class="resp-contact-pill">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                    <span>${escapeHtml(r.phone)}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Informações de locais com badges
        const locList = document.getElementById('details-location-list');
        const locations = project.locations && project.locations.length > 0
            ? project.locations
            : [{ name: project.location }];
        locList.innerHTML = locations.map(l => `
            <div class="location-badge-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <span>${escapeHtml(l.name)}</span>
            </div>
        `).join('');

        // Período
        const startFmt = project.start_date ? project.start_date.split('-').reverse().join('/') : '-';
        const endFmt = project.end_date ? project.end_date.split('-').reverse().join('/') : '-';
        document.getElementById('details-period').textContent = `${startFmt} até ${endFmt}`;
        document.getElementById('details-objective').innerHTML = escapeHtmlMultiline(project.objective);

        const evalContainer = document.getElementById('details-eval-container');
        if (project.evaluation_analysis) {
            evalContainer.style.display = 'block';
            document.getElementById('details-evaluation').innerHTML = escapeHtmlMultiline(project.evaluation_analysis);
        } else {
            evalContainer.style.display = 'none';
        }

        // Renderiza Linha do Tempo Visual
        renderDetailsTimeline(project);

        document.getElementById('details-modal-overlay').classList.add('active');
    } catch (error) {
        Toast.show(error.message, 'error');
    }
}

function renderDetailsTimeline(project) {
    const timelineContainer = document.getElementById('details-timeline-container');
    timelineContainer.innerHTML = TimelineComponent.render(project.id, project.activities);

    TimelineComponent.bindEvents(timelineContainer, async (projectId, activityId, newStatus) => {
        try {
            const updated = await api.updateActivityStatus(projectId, activityId, newStatus);
            Toast.show('Status da etapa atualizado com sucesso!', 'success');
            // Atualiza a visualização da modal imediatamente sem esperar o dashboard
            state.currentDetailProject = updated;
            renderDetailsTimeline(updated);
            // Recarrega o dashboard em segundo plano com debounce (evita flood de requisições)
            scheduleDashboardReload(500);
        } catch (error) {
            Toast.show(error.message, 'error');
        }
    });
}

function closeDetailsModal() {
    document.getElementById('details-modal-overlay').classList.remove('active');
    state.currentDetailProject = null;
}

// ==========================================================================
// MODAL DE VISUALIZAR E EDITAR ETAPAS (CRONOGRAMA)
// ==========================================================================
async function openProjectActivitiesModal(projectId) {
    try {
        // Tenta usar o projeto já carregado no modal de detalhes (evita round-trip extra)
        let project = (state.currentDetailProject && state.currentDetailProject.id === projectId)
            ? state.currentDetailProject
            : null;

        if (!project) {
            // Verifica cache antes de ir ao servidor
            if (state._cachedProjectForActivities && state._cachedProjectForActivities.id === projectId) {
                project = state._cachedProjectForActivities;
            } else {
                project = await api.getProjectById(projectId);
                state._cachedProjectForActivities = project;
            }
        }

        if (!project) throw new Error('Projeto não encontrado.');

        state.currentActivitiesProjectId = projectId;
        document.getElementById('activities-modal-project-name').textContent = project.name;

        const activities = project.activities || [];
        const completedCount = activities.filter(a => a.status === 'Concluída').length;
        const totalCount = activities.length;
        const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : (project.status === 'Concluído' ? 100 : 0);

        document.getElementById('activities-progress-label').textContent = `${completedCount} de ${totalCount} etapas concluídas`;
        document.getElementById('activities-progress-percent').textContent = `${percent}%`;
        document.getElementById('activities-progress-fill').style.width = `${percent}%`;

        const container = document.getElementById('activities-modal-rows');
        container.innerHTML = '';

        if (activities.length === 0) {
            addActivityModalRow();
        } else {
            activities.forEach((act) => {
                addActivityModalRow(act.description, act.target_date, act.status);
            });
        }

        document.getElementById('activities-modal-overlay').classList.add('active');
    } catch (error) {
        Toast.show(error.message, 'error');
    }
}

function closeProjectActivitiesModal() {
    document.getElementById('activities-modal-overlay').classList.remove('active');
    state.currentActivitiesProjectId = null;
    state._cachedProjectForActivities = null; // limpa cache ao fechar
}

function addActivityModalRow(desc = '', date = '', status = 'Pendente') {
    const container = document.getElementById('activities-modal-rows');
    const index = container.children.length + 1;
    const row = document.createElement('div');
    row.className = 'activity-edit-row';
    row.innerHTML = `
        <div class="activity-index-badge">${index}</div>
        <input type="text" class="form-input activity-modal-desc" placeholder="Descrição da etapa..." value="${escapeHtml(desc)}" required>
        <input type="date" class="form-input activity-modal-date" value="${date}" required>
        <select class="form-select activity-modal-status">
            <option value="Pendente" ${status === 'Pendente' ? 'selected' : ''}>Pendente</option>
            <option value="Em Andamento" ${status === 'Em Andamento' ? 'selected' : ''}>Em Andamento</option>
            <option value="Concluída" ${status === 'Concluída' ? 'selected' : ''}>Concluída</option>
        </select>
        <button type="button" class="btn-remove-step" title="Remover Etapa">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
        </button>
    `;

    row.querySelector('.btn-remove-step').addEventListener('click', () => {
        container.removeChild(row);
        Array.from(container.children).forEach((r, i) => {
            const badge = r.querySelector('.activity-index-badge');
            if (badge) badge.textContent = i + 1;
        });
    });

    container.appendChild(row);
}

async function saveProjectActivitiesModal() {
    if (!state.currentActivitiesProjectId) return;
    const projectId = state.currentActivitiesProjectId;
    const rows = document.querySelectorAll('#activities-modal-rows .activity-edit-row');
    const activities = [];

    rows.forEach(row => {
        const desc = row.querySelector('.activity-modal-desc').value.trim();
        const date = row.querySelector('.activity-modal-date').value;
        const status = row.querySelector('.activity-modal-status').value;
        if (desc && date) {
            activities.push({ description: desc, target_date: date, status });
        }
    });

    if (activities.length === 0) {
        Toast.show('O cronograma deve possuir pelo menos uma etapa com descrição e data.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('btn-save-activities-modal');
    const originalText = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando...'; }

    try {
        // Usa cache do projeto para evitar round-trip extra ao servidor
        let project = state._cachedProjectForActivities && state._cachedProjectForActivities.id === projectId
            ? state._cachedProjectForActivities
            : (state.currentDetailProject && state.currentDetailProject.id === projectId
                ? state.currentDetailProject
                : null);

        if (!project) {
            project = await api.getProjectById(projectId);
        }

        const payload = {
            name: project.name,
            classification: project.classification,
            type: project.type,
            projectDate: project.project_date,
            startDate: project.start_date,
            endDate: project.end_date,
            objective: project.objective,
            evaluationAnalysis: project.evaluation_analysis,
            responsibles: project.responsibles || [{ name: project.responsible_name, email: project.responsible_email, phone: project.responsible_phone }],
            locations: project.locations ? project.locations.map(l => l.name) : [project.location],
            activities: activities
        };

        await api.updateProject(projectId, payload);
        Toast.show('Etapas do cronograma atualizadas com sucesso!', 'success');
        closeProjectActivitiesModal();

        // Se o modal de detalhes estiver aberto, atualiza-o
        if (state.currentDetailProject && state.currentDetailProject.id === projectId) {
            openProjectDetailsModal(projectId);
        }
        scheduleDashboardReload();
    } catch (error) {
        Toast.show(error.message, 'error');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalText; }
    }
}

// ==========================================================================
// MODAL DE COMPARTILHAMENTO DE PROJETOS
// ==========================================================================
let currentShareProjectId = null;

async function openShareProjectModal(projectId, projectName) {
    currentShareProjectId = projectId;
    document.getElementById('share-project-modal-title').textContent = `Compartilhar: ${projectName}`;
    document.getElementById('share-target-email').value = '';
    document.getElementById('modal-share-project').style.display = 'flex';
    document.getElementById('modal-share-project').classList.add('active');

    await loadProjectShares(projectId);
}

function closeShareProjectModal() {
    document.getElementById('modal-share-project').style.display = 'none';
    document.getElementById('modal-share-project').classList.remove('active');
    currentShareProjectId = null;
}

async function loadProjectShares(projectId) {
    const listContainer = document.getElementById('share-users-list');
    listContainer.innerHTML = '<div style="font-size:0.875rem; color:var(--color-text-secondary); text-align:center; padding:1rem;">Carregando acessos...</div>';

    try {
        const shares = await api.getProjectShares(projectId);
        if (!shares || shares.length === 0) {
            listContainer.innerHTML = `
                <div style="font-size:0.875rem; color:var(--color-text-secondary); text-align:center; padding:1rem; border:1px dashed var(--color-border); border-radius:6px;">
                    Este projeto ainda não foi compartilhado com nenhum outro usuário.
                </div>
            `;
            return;
        }

        listContainer.innerHTML = shares.map(s => `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:0.6rem 0.75rem; background:var(--color-surface); border:1px solid var(--color-border); border-radius:6px;">
                <div>
                    <div style="font-weight:600; font-size:0.875rem;">${escapeHtml(s.name)}</div>
                    <div style="font-size:0.75rem; color:var(--color-text-secondary);">${escapeHtml(s.email)}</div>
                </div>
                <button type="button" class="btn btn-outline-danger btn-sm" onclick="handleRemoveShare(${projectId}, ${s.user_id})" title="Revogar Acesso" style="padding:0.25rem 0.5rem; font-size:0.75rem;">
                    Revogar
                </button>
            </div>
        `).join('');
    } catch (error) {
        listContainer.innerHTML = `<div style="color:var(--color-danger); font-size:0.875rem;">Erro ao carregar compartilhamentos: ${escapeHtml(error.message)}</div>`;
    }
}

async function handleAddShare(e) {
    e.preventDefault();
    if (!currentShareProjectId) return;

    const emailInput = document.getElementById('share-target-email');
    const email = emailInput.value.trim();
    if (!email) return;

    try {
        const res = await api.shareProject(currentShareProjectId, email);
        Toast.show(res.message || 'Projeto compartilhado com sucesso!', 'success');
        emailInput.value = '';
        await loadProjectShares(currentShareProjectId);
    } catch (error) {
        Toast.show(error.message, 'error');
    }
}

async function handleRemoveShare(projectId, userId) {
    if (!confirm('Deseja realmente revogar o acesso deste usuário ao projeto?')) return;

    try {
        await api.removeProjectShare(projectId, userId);
        Toast.show('Compartilhamento revogado com sucesso!', 'info');
        await loadProjectShares(projectId);
    } catch (error) {
        Toast.show(error.message, 'error');
    }
}

// ==========================================================================
// EXPORTAÇÃO DO PROJETO EM PDF
// ==========================================================================
async function exportProjectToPdf(projectId) {
    try {
        const project = await api.getProjectById(projectId);
        if (!project) throw new Error('Projeto não encontrado para exportação.');

        const deadline = project.deadline_info || {};
        const activities = project.activities || [];
        const responsibles = project.responsibles && project.responsibles.length > 0
            ? project.responsibles
            : [{ name: project.responsible_name, email: project.responsible_email, phone: project.responsible_phone }];
        const locations = project.locations && project.locations.length > 0
            ? project.locations
            : [{ name: project.location }];

        const completedCount = activities.filter(a => a.status === 'Concluída').length;
        const totalCount = activities.length;
        const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : (project.status === 'Concluído' ? 100 : 0);

        const startDateFmt = project.start_date ? project.start_date.split('-').reverse().join('/') : '-';
        const endDateFmt = project.end_date ? project.end_date.split('-').reverse().join('/') : '-';
        const emissionDate = new Date().toLocaleString('pt-BR');

        // Cria iframe temporário para gerar impressão sem afetar o layout
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Relatório do Projeto - ${escapeHtml(project.name)}</title>
                <style>
                    @page { size: A4; margin: 15mm; }
                    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
                    body { color: #1e293b; background: #ffffff; font-size: 11pt; line-height: 1.45; }
                    
                    .header { border-bottom: 2px solid #0b4628; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; }
                    .header-brand-block { display: flex; align-items: center; gap: 14px; }
                    .header-logo { height: 48px; width: auto; display: block; object-fit: contain; }
                    .brand { font-size: 15pt; font-weight: 800; color: #0b4628; line-height: 1.2; }
                    .brand-sub { font-size: 8.5pt; color: #64748b; font-weight: 500; margin-top: 2px; }
                    .emission-meta { font-size: 8.5pt; color: #64748b; text-align: right; }

                    .title-section { margin-bottom: 16px; }
                    .project-title { font-size: 16pt; font-weight: 700; color: #0b4628; margin-bottom: 6px; }
                    .tag-row { display: flex; gap: 6px; align-items: center; margin-bottom: 10px; }
                    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 8pt; font-weight: 700; text-transform: uppercase; }
                    .badge-indigo { background: #dcfce7; color: #0b4628; }
                    .badge-sky { background: #ffedd5; color: #c25e0a; }
                    .badge-danger { background: #fee2e2; color: #991b1b; }
                    .badge-warning { background: #fef3c7; color: #92400e; }
                    .badge-success { background: #d1fae5; color: #065f46; }
                    .badge-info { background: #e0f2fe; color: #075985; }

                    .deadline-box { background: #f8fafc; border-left: 4px solid #0b4628; padding: 8px 12px; border-radius: 4px; font-size: 9.5pt; margin-bottom: 16px; }
                    .deadline-box.atrasado { border-left-color: #ef4444; background: #fef2f2; color: #991b1b; }
                    .deadline-box.alerta { border-left-color: #f59e0b; background: #fffbeb; color: #92400e; }
                    .deadline-box.concluido { border-left-color: #10b981; background: #ecfdf5; color: #065f46; }

                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
                    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; }
                    .info-card h4 { font-size: 8.5pt; text-transform: uppercase; color: #64748b; margin-bottom: 6px; font-weight: 700; letter-spacing: 0.03em; }
                    .info-card p { font-size: 9.5pt; color: #1e293b; }

                    .resp-item, .loc-item { margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px dashed #cbd5e1; }
                    .resp-item:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
                    .resp-item strong { font-size: 9.5pt; color: #0f172a; }
                    .resp-sub { font-size: 8.5pt; color: #475569; }
                    .loc-item { font-size: 9.5pt; color: #1e293b; line-height: 1.35; }
                    .period-item { margin-top: 6px; font-size: 9.5pt; color: #1e293b; }

                    .progress-box { margin-bottom: 16px; }
                    .progress-header { display: flex; justify-content: space-between; font-size: 8.5pt; font-weight: 700; margin-bottom: 4px; }
                    .progress-bar-bg { width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
                    .progress-bar-fill { height: 100%; background: #0b4628; border-radius: 4px; width: ${percent}%; }

                    .section-heading { font-size: 11pt; font-weight: 700; color: #0b4628; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 9pt; }
                    th { background: #f1f5f9; color: #475569; font-weight: 700; text-align: left; padding: 6px 8px; border: 1px solid #cbd5e1; }
                    td { padding: 6px 8px; border: 1px solid #e2e8f0; color: #1e293b; }
                    tr:nth-child(even) { background: #f8fafc; }

                    .signature-section { margin-top: 35px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; page-break-inside: avoid; }
                    .sig-line { border-top: 1px solid #94a3b8; text-align: center; padding-top: 6px; font-size: 8.5pt; color: #475569; }

                    @media print {
                        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="header-brand-block">
                        <img src="${window.location.origin}/img/logo-branco-peres-print.png" alt="Branco Peres Agribusiness" class="header-logo">
                        <div>
                            <div class="brand">Branco Peres Agribusiness</div>
                            <div class="brand-sub">Poma &bull; Inteligência Agrícola</div>
                        </div>
                    </div>
                    <div class="emission-meta">
                        <div>Relatório Técnico de Projeto</div>
                        <div>Emitido em: ${emissionDate}</div>
                    </div>
                </div>

                <div class="title-section">
                    <h1 class="project-title">${escapeHtml(project.name)}</h1>
                    <div class="tag-row">
                        <span class="badge badge-indigo">${escapeHtml(project.classification)}</span>
                        <span class="badge badge-sky">${escapeHtml(project.type)}</span>
                        <span class="badge badge-${deadline.badgeColor}">${escapeHtml(deadline.label)}</span>
                    </div>
                    <div class="deadline-box ${deadline.status}">
                        <strong>Situação do Prazo:</strong> ${escapeHtml(deadline.message)}
                    </div>
                </div>

                <div class="info-grid">
                    <div class="info-card">
                        <h4>Responsável(eis) pelo Projeto</h4>
                        ${responsibles.map(r => `
                            <div class="resp-item">
                                <div><strong>${escapeHtml(r.name || 'Não informado')}</strong></div>
                                <div class="resp-sub">${escapeHtml(r.email || '-')}${r.phone ? ' &bull; ' + escapeHtml(r.phone) : ''}</div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="info-card">
                        <h4>Local(ais) e Período de Execução</h4>
                        ${locations.map(l => `
                            <div class="loc-item">
                                <div>${escapeHtml(l.name || 'Não informado')}</div>
                            </div>
                        `).join('')}
                        <div class="period-item">
                            <strong>Período:</strong> ${startDateFmt} até ${endDateFmt}
                        </div>
                    </div>
                </div>

                <div class="info-card" style="margin-bottom: 16px;">
                    <h4>Objetivo do Projeto</h4>
                    <p style="white-space: pre-wrap;">${escapeHtmlMultiline(project.objective)}</p>
                </div>

                ${project.evaluation_analysis ? `
                <div class="info-card" style="margin-bottom: 16px;">
                    <h4>Critérios de Avaliação e Análise</h4>
                    <p style="white-space: pre-wrap;">${escapeHtmlMultiline(project.evaluation_analysis)}</p>
                </div>
                ` : ''}

                <div class="progress-box">
                    <div class="progress-header">
                        <span>Progresso do Cronograma</span>
                        <span>${completedCount} de ${totalCount} etapas concluídas (${percent}%)</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill"></div>
                    </div>
                </div>

                <div class="section-heading">Cronograma Detalhado de Etapas</div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 35px; text-align: center;">#</th>
                            <th>Descrição da Etapa</th>
                            <th style="width: 100px; text-align: center;">Previsão</th>
                            <th style="width: 110px; text-align: center;">Status</th>
                            <th style="width: 120px; text-align: center;">Situação Prazo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${activities.length > 0 ? activities.map((act, idx) => {
                            const actDate = act.target_date ? act.target_date.split('-').reverse().join('/') : '-';
                            const actDeadline = act.deadline_info || {};
                            return `
                                <tr>
                                    <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
                                    <td>${escapeHtml(act.description)}</td>
                                    <td style="text-align: center;">${actDate}</td>
                                    <td style="text-align: center;"><strong>${escapeHtml(act.status)}</strong></td>
                                    <td style="text-align: center;">${escapeHtml(actDeadline.label || '-')}</td>
                                </tr>
                            `;
                        }).join('') : `
                            <tr>
                                <td colspan="5" style="text-align: center; color: #64748b; padding: 12px;">Nenhuma etapa cadastrada neste cronograma.</td>
                            </tr>
                        `}
                    </tbody>
                </table>

                <div class="signature-section">
                    <div class="sig-line">
                        <strong>${escapeHtml(responsibles[0]?.name || 'Responsável Técnico')}</strong>
                        <div>Assinatura do Responsável</div>
                    </div>
                    <div class="sig-line">
                        <strong>Branco Peres Agribusiness</strong>
                        <div>Validação e Controle Operacional • Metodologia PAAM</div>
                    </div>
                </div>
            </body>
            </html>
        `);
        doc.close();

        const triggerPrint = () => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
                if (iframe.parentNode) {
                    document.body.removeChild(iframe);
                }
            }, 1000);
        };

        const logoImg = doc.querySelector('.header-logo');
        if (logoImg && !logoImg.complete) {
            logoImg.onload = () => setTimeout(triggerPrint, 150);
            logoImg.onerror = () => setTimeout(triggerPrint, 150);
        } else {
            setTimeout(triggerPrint, 300);
        }

    } catch (error) {
        Toast.show('Erro ao exportar PDF: ' + error.message, 'error');
    }
}

async function confirmDeleteProject(projectId, projectName) {
    if (confirm(`Tem certeza que deseja excluir o projeto "${projectName}"?\nTodas as atividades do cronograma serão removidas definitivamente.`)) {
        try {
            await api.deleteProject(projectId);
            Toast.show('Projeto excluído com sucesso.', 'success');
            scheduleDashboardReload();
        } catch (error) {
            Toast.show(error.message, 'error');
        }
    }
}

// ==========================================================================
// EVENT BINDINGS
// ==========================================================================
function bindGlobalEvents() {
    // 1. Auth Tabs
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const fieldName = document.getElementById('field-name-container');
    const authBtn = document.getElementById('btn-auth-submit');
    const authSubtitle = document.getElementById('auth-subtitle');

    tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        fieldName.style.display = 'none';
        authBtn.textContent = 'Entrar no Sistema';
        authSubtitle.textContent = 'Acesse seu painel integrado de projetos';
    });

    tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        fieldName.style.display = 'block';
        authBtn.textContent = 'Criar Nova Conta';
        authSubtitle.textContent = 'Cadastre-se para gerenciar seus projetos';
    });

    // 2. Demo Fill
    document.getElementById('btn-fill-demo').addEventListener('click', () => {
        document.getElementById('auth-email').value = 'demo@cesinha.com';
        document.getElementById('auth-password').value = 'demo123';
        Toast.show('Dados de demonstração preenchidos!', 'info');
    });

    // 3. Auth Submit
    document.getElementById('auth-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const isRegister = tabRegister.classList.contains('active');
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const name = document.getElementById('auth-name').value;

        try {
            if (isRegister) {
                await api.register(name, email, password);
                Toast.show('Conta criada com sucesso! Bem-vindo.', 'success');
            } else {
                await api.login(email, password);
                Toast.show('Login efetuado com sucesso!', 'success');
            }
            state.currentUser = api.getUser();
            renderAuthenticatedUI();
            loadDashboard();
        } catch (error) {
            Toast.show(error.message, 'error');
        }
    });

    // 3b. Forgot Password — Navegação
    document.getElementById('btn-show-forgot').addEventListener('click', showForgotPasswordView);
    document.getElementById('btn-back-to-login').addEventListener('click', renderAuthView);

    // 3c. Forgot Password — Submit
    document.getElementById('forgot-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value.trim();
        const btn = document.getElementById('btn-forgot-submit');
        const originalText = btn.textContent;

        try {
            btn.disabled = true;
            btn.textContent = 'Enviando...';
            await api.forgotPassword(email);
            document.getElementById('forgot-subtitle').textContent =
                '✅ Se este e-mail estiver cadastrado, você receberá as instruções em breve. Verifique também a caixa de spam.';
            document.getElementById('forgot-form').reset();
            Toast.show('Instruções enviadas! Verifique seu e-mail.', 'success');
        } catch (error) {
            Toast.show(error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });

    // 3d. Reset Password — Submit (tela acessada via link do e-mail)
    document.getElementById('reset-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('reset-password').value;
        const confirm = document.getElementById('reset-password-confirm').value;
        const token = e.target.dataset.token;
        const btn = document.getElementById('btn-reset-submit');
        const originalText = btn.textContent;

        if (!token) {
            Toast.show('Token de redefinição ausente. Solicite um novo link.', 'error');
            return;
        }
        if (password.length < 6) {
            Toast.show('A senha deve ter no mínimo 6 caracteres.', 'error');
            return;
        }
        if (password !== confirm) {
            Toast.show('As senhas não coincidem.', 'error');
            return;
        }

        try {
            btn.disabled = true;
            btn.textContent = 'Salvando...';
            await api.resetPassword(token, password);
            Toast.show('Senha redefinida com sucesso! Faça login com sua nova senha.', 'success');
            renderAuthView();
        } catch (error) {
            Toast.show(error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });

    // 3e. Reset Password — Navegação de volta
    const btnResetBack = document.getElementById('btn-reset-back-login');
    if (btnResetBack) btnResetBack.addEventListener('click', renderAuthView);

    // 3f. Reset Password — Toggle de visibilidade da senha
    const btnToggleResetPw = document.getElementById('btn-toggle-reset-pw');
    if (btnToggleResetPw) {
        btnToggleResetPw.addEventListener('click', () => {
            const input = document.getElementById('reset-password');
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            // Alterna ícones olho aberto/fechado dentro deste botão
            const eyeOpen = btnToggleResetPw.querySelector('svg:first-of-type');
            const eyeClosed = btnToggleResetPw.querySelector('svg:last-of-type');
            if (eyeOpen) eyeOpen.style.display = isHidden ? 'none' : 'block';
            if (eyeClosed) eyeClosed.style.display = isHidden ? 'block' : 'none';
        });
    }

    // 4. Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
        api.logout();
        renderAuthView();
        Toast.show('Sessão encerrada.', 'info');
    });

    // 5. Notifications Bell Dropdown
    const notifBtn = document.getElementById('btn-notifications');
    const notifDropdown = document.getElementById('notification-dropdown');
    notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifDropdown.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!notifDropdown.contains(e.target) && !notifBtn.contains(e.target)) {
            notifDropdown.classList.remove('active');
        }
    });

    // 6. Project Modal Controls
    document.getElementById('btn-open-create-modal').addEventListener('click', openCreateProjectModal);
    document.getElementById('btn-close-project-modal').addEventListener('click', closeProjectModal);
    document.getElementById('btn-cancel-project-modal').addEventListener('click', closeProjectModal);
    document.getElementById('btn-add-activity-row').addEventListener('click', () => addScheduleRow());
    document.getElementById('btn-add-responsible-row').addEventListener('click', () => addResponsibleRow());
    document.getElementById('btn-add-location-row').addEventListener('click', () => addLocationRow());

    // 6b. Theme Toggle (sincroniza todos os botões de alternância)
    document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
        btn.addEventListener('click', () => ThemeManager.toggle());
    });

    // Máscara dinâmica para o telefone (legado — mantida por compatibilidade com futuras versões)
    // A máscara agora é aplicada individualmente em cada linha de responsável via addResponsibleRow()

    // 7. Salvar Projeto (Submit do formulário)
    document.getElementById('project-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        // Extrai responsáveis
        const responsibleRows = document.querySelectorAll('#responsibles-container .schedule-row');
        const responsibles = [];
        responsibleRows.forEach(row => {
            const name = row.querySelector('.resp-name').value.trim();
            const email = row.querySelector('.resp-email').value.trim();
            const phone = row.querySelector('.resp-phone').value.trim();
            if (name || email) {
                responsibles.push({ name, email, phone });
            }
        });

        // Extrai locais
        const locationRows = document.querySelectorAll('#locations-container .schedule-row');
        const locations = [];
        locationRows.forEach(row => {
            const name = row.querySelector('.loc-name').value.trim();
            if (name) locations.push(name);
        });

        // Extrai atividades do cronograma dinâmico
        const scheduleRows = document.querySelectorAll('#schedule-rows-container .schedule-row');
        const activities = [];
        scheduleRows.forEach(row => {
            const desc = row.querySelector('.activity-desc').value.trim();
            const date = row.querySelector('.activity-date').value;
            const status = row.querySelector('.activity-status').value;
            if (desc && date) {
                activities.push({
                    description: desc,
                    target_date: date,
                    status: status
                });
            }
        });

        const projectPayload = {
            name: document.getElementById('proj-name').value,
            projectDate: document.getElementById('proj-date').value,
            classification: document.getElementById('proj-classification').value,
            type: document.getElementById('proj-type').value,
            responsibles: responsibles,
            locations: locations,
            objective: document.getElementById('proj-objective').value,
            startDate: document.getElementById('proj-start-date').value,
            endDate: document.getElementById('proj-end-date').value,
            evaluationAnalysis: document.getElementById('proj-evaluation').value,
            activities: activities
        };

        // Validações client-side antes de chamar a API
        if (responsibles.length === 0) {
            Toast.show('Adicione pelo menos um responsável ao projeto.', 'error');
            return;
        }
        if (locations.length === 0) {
            Toast.show('Adicione pelo menos um local de execução ao projeto.', 'error');
            return;
        }
        if (projectPayload.startDate && projectPayload.endDate && new Date(projectPayload.startDate) > new Date(projectPayload.endDate)) {
            Toast.show('A Data de Início não pode ser posterior à Previsão de Término.', 'error');
            return;
        }

        try {
            const submitBtn = document.querySelector('#project-form button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Salvando...'; }

            if (state.editingProjectId) {
                await api.updateProject(state.editingProjectId, projectPayload);
                Toast.show('Projeto atualizado com sucesso!', 'success');
            } else {
                await api.createProject(projectPayload);
                Toast.show('Projeto cadastrado com sucesso!', 'success');
            }
            closeProjectModal();
            scheduleDashboardReload();
        } catch (error) {
            Toast.show(error.message, 'error');
        } finally {
            const submitBtn = document.querySelector('#project-form button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = state.editingProjectId ? 'Salvar Alterações' : 'Cadastrar Projeto'; }
        }
    });

    // 8. Details Modal Controls
    document.getElementById('btn-close-details-modal').addEventListener('click', closeDetailsModal);
    document.getElementById('btn-close-details-action').addEventListener('click', closeDetailsModal);
    document.getElementById('btn-edit-from-details').addEventListener('click', () => {
        if (state.currentDetailProject) {
            const id = state.currentDetailProject.id;
            closeDetailsModal();
            openEditProjectModal(id);
        }
    });

    // 8b. Botões de PDF e Gestão de Etapas no Modal de Detalhes
    document.getElementById('btn-export-pdf-details').addEventListener('click', () => {
        if (state.currentDetailProject) {
            exportProjectToPdf(state.currentDetailProject.id);
        }
    });

    document.getElementById('btn-quick-manage-activities').addEventListener('click', () => {
        if (state.currentDetailProject) {
            openProjectActivitiesModal(state.currentDetailProject.id);
        }
    });

    // 8c. Controles do Modal de Etapas
    document.getElementById('btn-close-activities-modal').addEventListener('click', closeProjectActivitiesModal);
    document.getElementById('btn-cancel-activities-modal').addEventListener('click', closeProjectActivitiesModal);
    document.getElementById('btn-save-activities-modal').addEventListener('click', saveProjectActivitiesModal);
    document.getElementById('btn-add-activity-modal-row').addEventListener('click', () => addActivityModalRow());

    // 9. Filters & Debounced Search
    const searchInput = document.getElementById('filter-search');
    let searchDebounceTimeout = null;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimeout);
        searchDebounceTimeout = setTimeout(() => {
            state.filters.search = e.target.value.trim();
            loadDashboard();
        }, 300);
    });

    document.getElementById('filter-classification').addEventListener('change', (e) => {
        state.filters.classification = e.target.value;
        loadDashboard();
    });

    document.getElementById('filter-type').addEventListener('change', (e) => {
        state.filters.type = e.target.value;
        loadDashboard();
    });

    document.getElementById('filter-deadline').addEventListener('change', (e) => {
        state.filters.deadline_status = e.target.value;
        loadDashboard();
    });

    // 10. Ordenação de projetos (client-side — sem nova requisição ao servidor)
    document.getElementById('sort-projects').addEventListener('change', (e) => {
        state.sort = e.target.value;
        renderProjectsGrid(); // apenas re-renderiza, sem chamar a API
    });

    // 11. Alternância de Modo de Visualização (Grade / Kanban / Calendário)
    const btnGrid = document.getElementById('btn-view-grid');
    const btnKanban = document.getElementById('btn-view-kanban');
    const btnCalendar = document.getElementById('btn-view-calendar');
    const gridContainer = document.getElementById('projects-grid');
    const kanbanContainer = document.getElementById('projects-kanban');
    const calendarContainer = document.getElementById('projects-calendar');

    if (btnGrid && btnKanban) {
        btnGrid.addEventListener('click', () => {
            state.currentView = 'grid';
            btnGrid.classList.add('active-view-btn');
            btnKanban.classList.remove('active-view-btn');
            if (btnCalendar) btnCalendar.classList.remove('active-view-btn');
            gridContainer.style.display = 'grid';
            kanbanContainer.style.display = 'none';
            if (calendarContainer) calendarContainer.style.display = 'none';
            const paginationEl = document.getElementById('projects-pagination');
            if (paginationEl && state.projects.length > 0) paginationEl.style.display = 'flex';
        });

        btnKanban.addEventListener('click', () => {
            state.currentView = 'kanban';
            btnKanban.classList.add('active-view-btn');
            btnGrid.classList.remove('active-view-btn');
            if (btnCalendar) btnCalendar.classList.remove('active-view-btn');
            gridContainer.style.display = 'none';
            kanbanContainer.style.display = 'grid';
            if (calendarContainer) calendarContainer.style.display = 'none';
            const paginationEl = document.getElementById('projects-pagination');
            if (paginationEl) paginationEl.style.display = 'none';
            renderKanbanBoard();
        });

        if (btnCalendar) {
            btnCalendar.addEventListener('click', () => {
                state.currentView = 'calendar';
                btnCalendar.classList.add('active-view-btn');
                btnGrid.classList.remove('active-view-btn');
                btnKanban.classList.remove('active-view-btn');
                gridContainer.style.display = 'none';
                kanbanContainer.style.display = 'none';
                if (calendarContainer) calendarContainer.style.display = 'flex';
                const paginationEl = document.getElementById('projects-pagination');
                if (paginationEl) paginationEl.style.display = 'none';
                renderCalendarView();
            });
        }
    }

    // Controles de Navegação do Calendário
    const btnCalPrev = document.getElementById('btn-calendar-prev');
    const btnCalNext = document.getElementById('btn-calendar-next');
    const btnCalToday = document.getElementById('btn-calendar-today');
    if (btnCalPrev) btnCalPrev.addEventListener('click', () => navigateCalendar(-1));
    if (btnCalNext) btnCalNext.addEventListener('click', () => navigateCalendar(1));
    if (btnCalToday) btnCalToday.addEventListener('click', () => resetCalendarToToday());

    // 12. Exportação de Relatório Analítico em Planilha CSV
    const btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', exportProjectsToCSV);
    }

    document.getElementById('btn-reset-filters').addEventListener('click', () => {
        state.filters = { classification: '', type: '', deadline_status: '', search: '' };
        state.sort = 'end_date';
        document.getElementById('filter-search').value = '';
        document.getElementById('filter-classification').value = '';
        document.getElementById('filter-type').value = '';
        document.getElementById('filter-deadline').value = '';
        document.getElementById('sort-projects').value = 'end_date';
        loadDashboard();
    });

    // 14. Compartilhamento de Projetos
    const btnCloseShare = document.getElementById('btn-close-share-modal');
    if (btnCloseShare) btnCloseShare.addEventListener('click', closeShareProjectModal);

    const btnCloseShareFooter = document.getElementById('btn-close-share-modal-footer');
    if (btnCloseShareFooter) btnCloseShareFooter.addEventListener('click', closeShareProjectModal);

    const formAddShare = document.getElementById('form-add-share');
    if (formAddShare) formAddShare.addEventListener('submit', handleAddShare);

    // 15. Modal de Criação Rápida no Calendário
    const btnCloseQuickAdd = document.getElementById('btn-close-quick-add-modal');
    if (btnCloseQuickAdd) btnCloseQuickAdd.addEventListener('click', closeCalendarQuickAddModal);

    const btnCancelQuickAdd = document.getElementById('btn-cancel-quick-add');
    if (btnCancelQuickAdd) btnCancelQuickAdd.addEventListener('click', closeCalendarQuickAddModal);

    const btnQuickNewProj = document.getElementById('btn-quick-new-project');
    if (btnQuickNewProj) {
        btnQuickNewProj.addEventListener('click', () => {
            const dateToUse = currentQuickAddDate;
            closeCalendarQuickAddModal();
            openCreateProjectModal(dateToUse);
        });
    }

    const formQuickAddAct = document.getElementById('form-quick-add-activity');
    if (formQuickAddAct) formQuickAddAct.addEventListener('submit', handleQuickAddActivity);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Escapa HTML (anti-XSS) e converte quebras de linha (\n) em <br>
 * para exibição correta de campos textarea em contextos innerHTML.
 */
function escapeHtmlMultiline(str) {
    if (!str) return '';
    return escapeHtml(str).replace(/\n/g, '<br>');
}

