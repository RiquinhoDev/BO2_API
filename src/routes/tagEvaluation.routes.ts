// ════════════════════════════════════════════════════════════
// 📁 src/routes/tagEvaluation.routes.ts
// Rotas para teste e avaliação do sistema de tags V2
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import { evaluateTags, evaluateTagsBatch } from '../controllers/tagEvaluation.controller'
import { asyncRoute } from '../security/asyncRoute'

const router = Router()

// ═══════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/tags/evaluate
 *
 * Avalia tags para um utilizador específico SEM tocar no ActiveCampaign
 *
 * Body:
 * {
 *   userId?: string,           // ID do user (ou email)
 *   email?: string,            // Email do user
 *   productId?: string,        // Avaliar apenas este produto
 *   dryRun?: boolean,          // true = não atualiza nada (default: true)
 *   updateLocalDB?: boolean,   // true = atualiza UserProduct.activeCampaignData.tags (default: false)
 *   verbose?: boolean,         // true = logs detalhados (default: false)
 *   includeDebugInfo?: boolean // true = info debug (default: true)
 * }
 *
 * Exemplos:
 *
 * 1. Ver tags que SERIAM aplicadas (sem mudar nada):
 *    POST { "email": "joao@example.com", "dryRun": true }
 *
 * 2. Atualizar apenas a BD local (sem tocar AC):
 *    POST { "email": "joao@example.com", "dryRun": false, "updateLocalDB": true }
 *
 * 3. Avaliar com logs detalhados:
 *    POST { "userId": "60f7b3b3e4b0c72e4c8b4567", "verbose": true }
 *
 * 4. Avaliar apenas um produto específico:
 *    POST { "email": "joao@example.com", "productId": "60f7b3b3e4b0c72e4c8b4568" }
 */
router.post('/evaluate', asyncRoute(evaluateTags))

/**
 * POST /api/tags/evaluate-batch
 *
 * Avalia tags para múltiplos utilizadores
 *
 * Body:
 * {
 *   userIds?: string[],        // IDs dos users
 *   emails?: string[],         // Emails dos users
 *   limit?: number,            // Limitar número de users (default: 10, max: 100)
 *   dryRun?: boolean,          // true = não atualiza nada (default: true)
 *   updateLocalDB?: boolean,   // true = atualiza UserProduct.activeCampaignData.tags (default: false)
 *   verbose?: boolean,         // true = logs detalhados (default: false)
 *   includeDebugInfo?: boolean // true = info debug (default: false)
 * }
 *
 * Exemplos:
 *
 * 1. Avaliar múltiplos users por email:
 *    POST { "emails": ["user1@example.com", "user2@example.com"], "dryRun": true }
 *
 * 2. Avaliar e atualizar BD local para múltiplos users:
 *    POST { "userIds": ["id1", "id2", "id3"], "dryRun": false, "updateLocalDB": true, "limit": 50 }
 */
router.post('/evaluate-batch', asyncRoute(evaluateTagsBatch))

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default router
