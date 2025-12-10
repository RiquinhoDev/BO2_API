// ════════════════════════════════════════════════════════════
// 📁 src/routes/syncStats.routes.ts
// Routes: Sync Statistics & Conflicts
// Rotas para estatísticas de sync e gestão de conflitos
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import * as syncStatsController from '../../controllers/syncUtilizadoresControllers.ts/syncStats.controller'

const router = Router()

// ═══════════════════════════════════════════════════════════
// SYNC STATISTICS
// ═══════════════════════════════════════════════════════════

/**
 * @route   GET /api/sync/stats
 * @desc    Estatísticas gerais de sincronizações
 * @query   days? - Período (default: 30)
 * @query   syncType? - Filtrar por tipo (hotmart, curseduca, discord)
 * @access  Private (Admin)
 */
router.get('/stats', syncStatsController.getSyncStats)

/**
 * @route   GET /api/sync/history
 * @desc    Histórico de sincronizações
 * @query   syncType? - Filtrar por tipo
 * @query   status? - Filtrar por status (pending, running, completed, failed, cancelled)
 * @query   triggeredBy? - Filtrar por trigger (MANUAL, CRON, WEBHOOK)
 * @query   limit? - Limite de resultados (default: 20)
 * @access  Private (Admin)
 */
router.get('/history', syncStatsController.getSyncHistory)

/**
 * @route   GET /api/sync/history/:id
 * @desc    Detalhes de sincronização específica
 * @access  Private (Admin)
 */
router.get('/history/:id', syncStatsController.getSyncById)

// ═══════════════════════════════════════════════════════════
// CONFLICTS MANAGEMENT
// ═══════════════════════════════════════════════════════════

/**
 * @route   GET /api/sync/conflicts
 * @desc    Listar conflitos
 * @query   status? - Filtrar por status (PENDING, RESOLVED, IGNORED, AUTO_RESOLVED, ALL)
 * @query   severity? - Filtrar por severidade (LOW, MEDIUM, HIGH, CRITICAL)
 * @query   conflictType? - Filtrar por tipo
 * @query   email? - Filtrar por email
 * @query   limit? - Limite de resultados (default: 50)
 * @access  Private (Admin)
 */
router.get('/conflicts', syncStatsController.getConflicts)

/**
 * @route   GET /api/sync/conflicts/critical
 * @desc    Listar conflitos críticos pendentes
 * @query   limit? - Limite de resultados (default: 20)
 * @access  Private (Admin)
 */
router.get('/conflicts/critical', syncStatsController.getCriticalConflicts)

/**
 * @route   GET /api/sync/conflicts/:id
 * @desc    Detalhes de conflito específico
 * @access  Private (Admin)
 */
router.get('/conflicts/:id', syncStatsController.getConflictById)

/**
 * @route   POST /api/sync/conflicts/:id/resolve
 * @desc    Resolver conflito manualmente
 * @body    { action: 'MERGED' | 'KEPT_EXISTING' | 'USED_NEW' | 'MANUAL' | 'IGNORED', notes?, appliedChanges? }
 * @access  Private (Admin)
 */
router.post('/conflicts/:id/resolve', syncStatsController.resolveConflict)

/**
 * @route   POST /api/sync/conflicts/:id/ignore
 * @desc    Ignorar conflito
 * @body    { reason? }
 * @access  Private (Admin)
 */
router.post('/conflicts/:id/ignore', syncStatsController.ignoreConflict)

/**
 * @route   POST /api/sync/conflicts/bulk-resolve
 * @desc    Resolver múltiplos conflitos de uma vez
 * @body    { conflictIds: string[], action: ResolutionAction, notes? }
 * @access  Private (Admin)
 */
router.post('/conflicts/bulk-resolve', syncStatsController.bulkResolveConflicts)

/**
 * @route   POST /api/sync/conflicts/auto-resolve
 * @desc    Tentar auto-resolver conflitos
 * @body    { conflictIds: string[] }
 * @access  Private (Admin)
 */
router.post('/conflicts/auto-resolve', syncStatsController.autoResolveConflicts)

// ═══════════════════════════════════════════════════════════
// ACTIVITY SNAPSHOTS
// ═══════════════════════════════════════════════════════════

/**
 * @route   GET /api/sync/snapshots/stats
 * @desc    Estatísticas de activity snapshots
 * @query   month? - Mês específico (YYYY-MM)
 * @query   platform? - Filtrar por plataforma (HOTMART, CURSEDUCA, DISCORD)
 * @access  Private (Admin)
 */
router.get('/snapshots/stats', syncStatsController.getSnapshotStats)

export default router