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
  withValidatedInput(syncExecutePipelineInput, (input, _req, res) =>
    syncController.executePipeline(input, res)),
)

// Hotmart sync
router.post('/hotmart', syncController.syncHotmartEndpoint)
router.post('/hotmart/batch', syncController.syncHotmartBatchEndpoint)

// CursEduca sync
router.post('/curseduca', syncController.syncCurseducaEndpoint)
router.post('/curseduca/batch', syncController.syncCurseducaBatchEndpoint)

// Discord sync
router.post('/discord', syncController.syncDiscordEndpoint)
router.post('/discord/csv', syncController.syncDiscordCSVEndpoint)
router.post('/discord/batch', syncController.syncDiscordBatchEndpoint)

// ═══════════════════════════════════════════════════════════
// SYNC HISTORY & STATS
// ═══════════════════════════════════════════════════════════

// Histórico
router.get('/history', syncController.getSyncHistory)
router.post('/history', syncController.createSyncRecord)
router.post('/history/:syncId/retry', syncController.retrySyncOperation)
router.delete(
  '/history/clean',
  withValidatedInput(syncCleanHistoryInput, (input, _req, res) =>
    syncController.cleanOldHistory(input, res)),
)

// Estatísticas
router.get('/stats', syncController.getSyncStats)
router.get('/status', syncController.getSyncStatus)

export default router
