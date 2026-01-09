// ════════════════════════════════════════════════════════════
// 📁 src/routes/cron.routes.ts
// Routes: CRON Job Management
// Rotas para gestão de jobs agendados
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import * as cronController from '../../controllers/syncUtilizadoresControllers.ts/cronManagement.controller'

const router = Router()

// ═══════════════════════════════════════════════════════════
// JOBS MANAGEMENT
// ═══════════════════════════════════════════════════════════

/**
 * @route   GET /api/cron/jobs
 * @desc    Listar todos os jobs (com filtros opcionais)
 * @query   syncType? - Filtrar por tipo (hotmart, curseduca, discord, all)
 * @query   active? - Filtrar apenas ativos (true/false)
 * @access  Private (Admin)
 */
router.get('/jobs', cronController.getAllJobs)

/**
 * @route   GET /api/cron/jobs/:id
 * @desc    Buscar job por ID
 * @access  Private (Admin)
 */
router.get('/jobs/:id', cronController.getJobById)

/**
 * @route   POST /api/cron/jobs
 * @desc    Criar novo job
 * @body    { name, description, syncType, cronExpression, timezone?, syncConfig?, notifications?, retryPolicy? }
 * @access  Private (Admin)
 */
router.post('/jobs', cronController.createJob)

/**
 * @route   PUT /api/cron/jobs/:id
 * @desc    Atualizar job
 * @body    { name?, description?, cronExpression?, timezone?, enabled?, syncConfig?, notifications?, retryPolicy? }
 * @access  Private (Admin)
 */
router.put('/jobs/:id', cronController.updateJob)

/**
 * @route   DELETE /api/cron/jobs/:id
 * @desc    Deletar job
 * @access  Private (Admin)
 */
router.delete('/jobs/:id', cronController.deleteJob)

/**
 * @route   POST /api/cron/jobs/:id/toggle
 * @desc    Ativar/desativar job
 * @body    { enabled: boolean }
 * @access  Private (Admin)
 */
router.post('/jobs/:id/toggle', cronController.toggleJob)

/**
 * @route   POST /api/cron/jobs/:id/trigger
 * @desc    Executar job manualmente
 * @access  Private (Admin)
 */
router.post('/jobs/:id/trigger', cronController.triggerJob)

/**
 * @route   GET /api/cron/jobs/:id/history
 * @desc    Buscar histórico de execuções do job
 * @query   limit? - Número de resultados (default: 10)
 * @access  Private (Admin)
 */
router.get('/jobs/:id/history', cronController.getJobHistory)

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

/**
 * @route   POST /api/cron/validate
 * @desc    Validar cron expression e ver próximas execuções
 * @body    { cronExpression, timezone? }
 * @access  Private (Admin)
 */
router.post('/validate', cronController.validateCronExpression)

/**
 * @route   GET /api/cron/status
 * @desc    Status geral do scheduler
 * @access  Private (Admin)
 */
router.get('/status', cronController.getSchedulerStatus)

router.get('/tag-rules', cronController.getAvailableTagRules)

/**
 * @route   POST /api/cron/tag-rules-only
 * @desc    Executar APENAS os steps de tags (sem sync Hotmart/CursEduca)
 *          Steps: Pre-create Tags → Recalc Engagement → Evaluate Tag Rules
 * @access  Private (Admin)
 */
router.post('/tag-rules-only', cronController.triggerTagRulesOnly)

export default router