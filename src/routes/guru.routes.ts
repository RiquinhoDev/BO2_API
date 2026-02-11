// src/routes/guru.routes.ts - Routes para integração Guru
import { Router, RequestHandler } from 'express'
import {
  handleGuruWebhook,
  listGuruWebhooks,
  getGuruStats,
  reprocessWebhook
} from '../controllers/guru.webhook.controller'
import {
  ssoMyOrders,
  getSubscriptionStatus,
  listSubscriptions,
  diagnosSubscription
} from '../controllers/guru.sso.controller'
import {
  syncAllFromGuru,
  syncEmailFromGuru,
  getSyncStats,
  previewSync,
  listUsersWithGuru
} from '../controllers/guru.sync.controller'
import {
  getChurnMetrics,
  getMRRMetrics,
  compareGuruVsClareza
} from '../controllers/guru.analytics.controller'
import {
  createSnapshot,
  updateSnapshot,
  listSnapshots,
  getSnapshot,
  deleteSnapshot,
  deleteAllSnapshots,
  getChurnFromSnapshots,
  createHistoricalSnapshots
} from '../controllers/guru.snapshot.controller'
import {
  listPendingInactivation,
  inactivateSingle,
  inactivateBulk,
  revertInactivationMark,
  getInactivationStats,
  markDiscrepanciesForInactivation
} from '../controllers/guru.inactivation.controller'

const router = Router()

// ═══════════════════════════════════════════════════════════
// HELPER: Wrapper para async controllers
// ═══════════════════════════════════════════════════════════
const asyncRoute = (fn: any): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

// ═══════════════════════════════════════════════════════════
// WEBHOOKS
// ═══════════════════════════════════════════════════════════

/**
 * POST /guru/webhook
 * Receber webhooks da plataforma Guru
 * - Valida api_token
 * - Usa X-Request-ID para idempotência
 * - Guarda webhook raw e atualiza User
 */
router.post('/webhook', asyncRoute(handleGuruWebhook))

// ═══════════════════════════════════════════════════════════
// SSO
// ═══════════════════════════════════════════════════════════

/**
 * GET /guru/myorders?email=xxx
 * Redirecionar utilizador para o portal MyOrders via SSO
 * - Valida email na BD
 * - Verifica status permitido
 * - Chama API Guru e redireciona
 */
router.get('/myorders', asyncRoute(ssoMyOrders))

/**
 * GET /guru/status?email=xxx
 * Verificar status de subscrição de um email
 */
router.get('/status', asyncRoute(getSubscriptionStatus))

// ═══════════════════════════════════════════════════════════
// DASHBOARD / ADMIN
// ═══════════════════════════════════════════════════════════

/**
 * GET /guru/webhooks
 * Listar webhooks recebidos (para dashboard)
 * Query params: page, limit, email, processed, status, event
 */
router.get('/webhooks', asyncRoute(listGuruWebhooks))

/**
 * GET /guru/stats
 * Obter estatísticas gerais
 */
router.get('/stats', asyncRoute(getGuruStats))

/**
 * GET /guru/subscriptions
 * Listar todas as subscrições
 * Query params: page, limit, status, productId
 */
router.get('/subscriptions', asyncRoute(listSubscriptions))

/**
 * GET /guru/diagnose?email=xxx
 * Endpoint de diagnóstico (debugging)
 */
router.get('/diagnose', asyncRoute(diagnosSubscription))

/**
 * POST /guru/webhooks/:id/reprocess
 * Reprocessar um webhook falhado
 */
router.post('/webhooks/:id/reprocess', asyncRoute(reprocessWebhook))

// ═══════════════════════════════════════════════════════════
// SYNC (APENAS LEITURA DA GURU - GUARDA NA NOSSA BD)
// ═══════════════════════════════════════════════════════════

/**
 * GET /guru/sync/preview
 * Preview do que seria sincronizado (não guarda)
 */
router.get('/sync/preview', asyncRoute(previewSync))

/**
 * GET /guru/sync/all
 * Sincronizar TODAS as subscrições da Guru para a nossa BD
 * NOTA: Apenas LÊ da Guru, nunca escreve na plataforma deles
 */
router.get('/sync/all', asyncRoute(syncAllFromGuru))

/**
 * GET /guru/sync/email/:email
 * Sincronizar um email específico
 */
router.get('/sync/email/:email', asyncRoute(syncEmailFromGuru))

/**
 * GET /guru/sync/stats
 * Estatísticas de sincronização
 */
router.get('/sync/stats', asyncRoute(getSyncStats))

/**
 * GET /guru/sync/users
 * Listar users com dados Guru (com info de cruzamento)
 */
router.get('/sync/users', asyncRoute(listUsersWithGuru))

// ═══════════════════════════════════════════════════════════
// ANALYTICS (MÉTRICAS E CHURN)
// ═══════════════════════════════════════════════════════════

/**
 * GET /guru/analytics/churn
 * Obter métricas de churn (taxa de cancelamento)
 */
router.get('/analytics/churn', asyncRoute(getChurnMetrics))

/**
 * GET /guru/analytics/mrr
 * Obter métricas de MRR (Monthly Recurring Revenue)
 */
router.get('/analytics/mrr', asyncRoute(getMRRMetrics))

/**
 * GET /guru/analytics/compare
 * Comparar cancelamentos Guru vs Clareza (UserProducts)
 */
router.get('/analytics/compare', asyncRoute(compareGuruVsClareza))

// ═══════════════════════════════════════════════════════════
// SNAPSHOTS (HISTÓRICO MENSAL)
// ═══════════════════════════════════════════════════════════

/**
 * POST /guru/snapshots
 * Criar snapshot de um mês específico
 * Body: { year: 2026, month: 1, source?: 'guru_api' | 'database' }
 */
router.post('/snapshots', asyncRoute(createSnapshot))

/**
 * POST /guru/snapshots/historical
 * Criar snapshots históricos retroativos
 * Body: { startYear?: 2024, startMonth?: 1, endYear?: 2026, endMonth?: 2 }
 */
router.post('/snapshots/historical', asyncRoute(createHistoricalSnapshots))

/**
 * GET /guru/snapshots
 * Listar todos os snapshots existentes
 */
router.get('/snapshots', asyncRoute(listSnapshots))

/**
 * GET /guru/snapshots/churn
 * Calcular churn usando snapshots (muito mais preciso!)
 */
router.get('/snapshots/churn', asyncRoute(getChurnFromSnapshots))

/**
 * DELETE /guru/snapshots/all
 * Apagar TODOS os snapshots (para recriação)
 * NOTA: Deve vir ANTES das routes com parâmetros
 */
router.delete('/snapshots/all', asyncRoute(deleteAllSnapshots))

/**
 * GET /guru/snapshots/:year/:month
 * Obter snapshot específico
 */
router.get('/snapshots/:year/:month', asyncRoute(getSnapshot))

/**
 * PUT /guru/snapshots/:year/:month
 * Atualizar snapshot existente (apaga e recria com dados atuais)
 */
router.put('/snapshots/:year/:month', asyncRoute(updateSnapshot))

/**
 * DELETE /guru/snapshots/:year/:month
 * Apagar snapshot
 */
router.delete('/snapshots/:year/:month', asyncRoute(deleteSnapshot))

// ═══════════════════════════════════════════════════════════
// INATIVAÇÃO CURSEDUCA
// ═══════════════════════════════════════════════════════════

/**
 * GET /guru/inactivation/pending
 * Listar UserProducts marcados como PARA_INATIVAR
 */
router.get('/inactivation/pending', asyncRoute(listPendingInactivation))

/**
 * GET /guru/inactivation/stats
 * Estatísticas de inativação
 */
router.get('/inactivation/stats', asyncRoute(getInactivationStats))

/**
 * POST /guru/inactivation/single
 * Inativar um único membro no CursEduca
 * Body: { userProductId: string } ou { curseducaUserId: string }
 */
router.post('/inactivation/single', asyncRoute(inactivateSingle))

/**
 * POST /guru/inactivation/bulk
 * Inativar múltiplos membros no CursEduca
 * Body: { userProductIds: string[] } ou { all: true }
 */
router.post('/inactivation/bulk', asyncRoute(inactivateBulk))

/**
 * POST /guru/inactivation/revert
 * Reverter a marcação de PARA_INATIVAR para ACTIVE
 * Body: { userProductId: string }
 */
router.post('/inactivation/revert', asyncRoute(revertInactivationMark))

/**
 * POST /guru/inactivation/mark-discrepancies
 * Marcar discrepâncias (Guru cancelado, Clareza ativo) para inativação
 * Body: { emails?: string[] } - se vazio, marca todas as discrepâncias
 */
router.post('/inactivation/mark-discrepancies', asyncRoute(markDiscrepanciesForInactivation))

export default router
