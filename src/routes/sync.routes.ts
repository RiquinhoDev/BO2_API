// ════════════════════════════════════════════════════════════
// 📁 src/routes/sync.routes.ts
// SYNC ROUTES (UNIFICADO)
// ════════════════════════════════════════════════════════════
//
// Rotas unificadas para sincronização
// Substitui rotas antigas de sync + syncV2
//
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import { asyncRoute } from '../security/asyncRoute'
import * as syncController from '../controllers/sync.controller'
import {
  syncCleanHistoryInput,
  syncExecutePipelineInput,
} from '../security/syncDestructiveInput'
import { withValidatedInput } from '../security/validatedInput'

const router = Router()

// ═══════════════════════════════════════════════════════════
// PIPELINE & SYNC OPERATIONS
// ═══════════════════════════════════════════════════════════

// Pipeline completo (4 steps: Sync Hotmart → Sync CursEduca → Recalc Engagement → Tag Rules)
router.post(
  '/execute-pipeline',
  withValidatedInput(syncExecutePipelineInput, (input, _req, res, next) =>
    syncController.executePipeline(input, res, next)),
)

// Hotmart sync
router.post('/hotmart', asyncRoute(syncController.syncHotmartEndpoint))
router.post('/hotmart/batch', asyncRoute(syncController.syncHotmartBatchEndpoint))

// CursEduca sync
router.post('/curseduca', asyncRoute(syncController.syncCurseducaEndpoint))
router.post('/curseduca/batch', asyncRoute(syncController.syncCurseducaBatchEndpoint))

// Discord sync
router.post('/discord', syncController.syncDiscordEndpoint)
router.post('/discord/csv', syncController.syncDiscordCSVEndpoint)
router.post('/discord/batch', syncController.syncDiscordBatchEndpoint)

// ═══════════════════════════════════════════════════════════
// SYNC HISTORY & STATS
// ═══════════════════════════════════════════════════════════

// Histórico
router.get('/history', asyncRoute(syncController.getSyncHistory))
router.post('/history', asyncRoute(syncController.createSyncRecord))
router.post('/history/:syncId/retry', asyncRoute(syncController.retrySyncOperation))
router.delete(
  '/history/clean',
  withValidatedInput(syncCleanHistoryInput, (input, _req, res, next) =>
    syncController.cleanOldHistory(input, res, next)),
)

// Estatísticas
router.get('/stats', asyncRoute(syncController.getSyncStats))
router.get('/status', asyncRoute(syncController.getSyncStatus))

export default router
