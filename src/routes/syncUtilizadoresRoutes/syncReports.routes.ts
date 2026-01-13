// ════════════════════════════════════════════════════════════
// 📁 src/routes/syncUtilizadoresRoutes/syncReports.routes.ts
// Routes: Sync Reports Endpoints
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import syncReportsController from '../../controllers/syncUtilizadoresControllers/syncReports.controller'

const router = Router()

// ═══════════════════════════════════════════════════════════
// SYNC REPORTS ROUTES
// ═══════════════════════════════════════════════════════════

/**
 * @route   GET /api/sync/reports
 * @desc    Obter todos os reports de sincronização
 * @query   limit? - Número de reports (default: 20)
 * @query   syncType? - Filtrar por tipo (hotmart|curseduca|discord|all)
 * @access  Private (Admin)
 */
router.get('/', syncReportsController.getAllReports)

/**
 * @route   GET /api/sync/reports/stats
 * @desc    Obter estatísticas agregadas dos reports
 * @query   days? - Número de dias para análise (default: 30)
 * @access  Private (Admin)
 */
router.get('/stats', syncReportsController.getAggregatedStats)

/**
 * @route   GET /api/sync/reports/:id
 * @desc    Obter um report específico por ID
 * @param   id - ID do report
 * @access  Private (Admin)
 */
router.get('/:id', syncReportsController.getReportById)

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default router