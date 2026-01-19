// ══════════════════════════════════════════════════════════════════════
// 📁 src/routes/testHistory.routes.ts
// Rotas de TESTE para sistema de histórico
// ⚠️ APENAS PARA DESENVOLVIMENTO - REMOVER EM PRODUÇÃO
// ══════════════════════════════════════════════════════════════════════

import express from 'express'
import * as testHistoryController from '../controllers/testHistory.controller'
import * as populateHistoryController from '../controllers/populateHistory.controller'

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

/**
 * POST /api/test/history/populate-retroactive
 * Popula histórico retroativo baseado nos dados existentes dos produtos
 * Body: { email: "user@example.com" } OU { userId: "123..." }
 */
router.post('/populate-retroactive', populateHistoryController.populateRetroactiveHistory)

/**
 * POST /api/test/history/delete-test-events
 * Apaga eventos de teste do histórico
 * Body: { email: "user@example.com" }
 */
router.post('/delete-test-events', populateHistoryController.deleteTestEvents)

/**
 * POST /api/test/history/populate-all-users
 * Popula histórico retroativo para TODOS os users (usa com cuidado!)
 * Body: { limit: 100 } (opcional, default 100)
 */
router.post('/populate-all-users', populateHistoryController.populateAllUsersHistory)

export default router
