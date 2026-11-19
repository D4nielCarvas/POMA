const { z } = require('zod');

// Regex para validação de e-mail e formato de data ISO (YYYY-MM-DD)
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// Schema para cada responsável
const responsibleSchema = z.object({
    name: z.string({ required_error: 'O nome do responsável é obrigatório.' })
        .trim().min(2, 'O nome do responsável precisa de no mínimo 2 caracteres.'),
    email: z.string({ required_error: 'O e-mail do responsável é obrigatório.' })
        .trim().regex(emailRegex, 'E-mail do responsável inválido.'),
    phone: z.string({ required_error: 'O telefone do responsável é obrigatório.' })
        .trim().min(8, 'Telefone do responsável precisa de no mínimo 8 dígitos.')
});

// Schema para cada local de execução
const locationSchema = z.union([
    z.string().trim().min(1, 'O local de execução precisa de um nome válido.'),
    z.object({
        name: z.string().trim().min(1, 'O local de execução precisa de um nome válido.')
    })
]);

// Schema para cada etapa do cronograma
const activitySchema = z.object({
    description: z.string({ required_error: 'A descrição da etapa é obrigatória.' })
        .trim().min(1, 'A descrição da etapa não pode ser vazia.'),
    target_date: z.string().regex(dateRegex, 'Data prevista deve estar no formato AAAA-MM-DD.').optional(),
    targetDate: z.string().regex(dateRegex, 'Data prevista deve estar no formato AAAA-MM-DD.').optional(),
    status: z.enum(['Pendente', 'Em Andamento', 'Concluída']).optional().default('Pendente')
}).refine(data => data.target_date || data.targetDate, {
    message: 'A etapa precisa de uma data prevista de realização.'
});

// Schema de Criação / Edição de Projetos
const projectSchema = z.object({
    name: z.string({ required_error: 'O Nome do Projeto é obrigatório.' })
        .trim().min(2, 'O Nome do Projeto deve ter no mínimo 2 caracteres.'),
    projectDate: z.string({ required_error: 'A Data do Projeto é obrigatória.' })
        .regex(dateRegex, 'Data de registro do projeto inválida.'),
    classification: z.enum(['Experimento', 'Monitoramento', 'Estudo de caso'], {
        errorMap: () => ({ message: 'Classificação inválida. Deve ser: Experimento, Monitoramento ou Estudo de caso' })
    }),
    type: z.enum(['Interno', 'Parceiro'], {
        errorMap: () => ({ message: 'Tipo inválido. Deve ser: Interno ou Parceiro' })
    }),
    responsibles: z.array(responsibleSchema).min(1, 'O projeto deve possuir pelo menos um responsável cadastrado.'),
    locations: z.array(locationSchema).min(1, 'O projeto deve possuir pelo menos um local de execução cadastrado.'),
    objective: z.string({ required_error: 'O Objetivo do Projeto é obrigatório.' })
        .trim().min(3, 'O Objetivo do Projeto deve ser preenchido.'),
    startDate: z.string({ required_error: 'A Data de Início é obrigatória.' })
        .regex(dateRegex, 'Data de início inválida.'),
    endDate: z.string({ required_error: 'A Data de Término é obrigatória.' })
        .regex(dateRegex, 'Data de término inválida.'),
    evaluationAnalysis: z.string().nullable().optional(),
    activities: z.array(activitySchema).optional().default([]),
    status: z.enum(['Pendente', 'Em Andamento', 'Concluído', 'Cancelado']).optional().default('Em Andamento')
}).refine(data => new Date(data.startDate) <= new Date(data.endDate), {
    message: 'A Data de Início não pode ser posterior à Previsão de Término.',
    path: ['startDate']
});

// Middleware Factory para validação Express
const validateBody = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
        const firstError = result.error.errors[0]?.message || 'Dados inválidos fornecidos.';
        return res.status(400).json({
            success: false,
            error: firstError,
            details: result.error.format()
        });
    }
    req.body = result.data;
    next();
};

module.exports = {
    projectSchema,
    validateBody
};
