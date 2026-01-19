// ══════════════════════════════════════════════════════════════════════
// 📁 src/routes/testHistory.routes.ts
// Rotas de TESTE para sistema de histórico
// ⚠️ APENAS PARA DESENVOLVIMENTO - REMOVER EM PRODUÇÃO
// ══════════════════════════════════════════════════════════════════════

import express from 'express'
import * as testHistoryController from '../controllers/testHistory.controller'

const router = express.Router()

/**
 * POST /api/test/history/make-changes
 * Faz alterações de teste no user
 * Body: { email: "user@example.com" }
 */
router.post('/make-changes', testHistoryController.makeTestChanges)

/**
 * POST /api/test/history/revert-changes
 * Reverte as alterações de teste
 * Body: { originalState: {...} }
 */
router.post('/revert-changes', testHistoryController.revertTestChanges)

export default router
