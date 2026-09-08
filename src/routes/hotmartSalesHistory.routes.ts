// ════════════════════════════════════════════════════════════
// 📁 src/routes/hotmartSalesHistory.routes.ts
// Sync Hotmart (Fase 1) — histórico de vendas por aluno OGI ativo.
// Endpoints manuais do Backoffice. Escrevem APENAS na nossa BD.
//
// A sync pode demorar vários minutos (37+ páginas Hotmart + upsert por
// aluno ativo) — corre com receipt durável e devolve o resultado ao pedido HTTP (senão
// o proxy da Railway corta a ligação por timeout antes de terminar, e
// o browser reporta isso como erro de CORS/502). Progresso visível via
// GET /status (syncInProgress) e GET /history (vai enchendo aos poucos).
// ════════════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express'
import { asyncRoute } from '../security/asyncRoute'
import HotmartSaleHistory from '../models/HotmartSaleHistory'
import { syncActiveStudentSalesHistory } from '../services/renewal/hotmartSalesHistory.service'
import { normalizeMainParityEmails, runMainParityExecution } from '../services/renewal/mainParityExecution'
import { getMainParityExecutionStatus } from '../services/renewal/mainParityExecutionStatus'
import { boundedQueryLimit } from '../utils/queryBounds'
import { requireRenewalMutationEnabled } from './renewalParityRouteGuards'
import { renewalReadOffset } from './renewalReadPagination'

const router = Router()


/**
 * GET /api/renewal-hotmart-sales/status
 * Contagens gerais + última sincronização.
 */
router.get('/status', asyncRoute(async (_req: Request, res: Response) => {
  const [total, withSales, lastSynced, execution] = await Promise.all([
    HotmartSaleHistory.countDocuments({}),
    HotmartSaleHistory.countDocuments({ salesCount: { $gt: 0 } }),
    HotmartSaleHistory.findOne({}).sort({ lastSyncedAt: -1 }).select('lastSyncedAt').lean().exec(),
    getMainParityExecutionStatus('hotmart-sales-history-sync'),
  ])

  // sem isto, alguma camada (proxy/CDN/browser) pode servir uma resposta
  // antiga enquanto o front sonda syncInProgress — visto em produção com
  // o /status da AC (BD avançava, HTTP não refletia).
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.json({
    success: true,
    data: {
      total,
      withSales,
      withoutSales: total - withSales,
      lastSyncedAt: lastSynced?.lastSyncedAt || null,
      execution,
    }
  })
}))

/**
 * GET /api/renewal-hotmart-sales/history?email=...&hasSales=true|false&limit=200
 */
router.get('/history', asyncRoute(async (req: Request, res: Response) => {
  const { email, hasSales } = req.query
  const limit = boundedQueryLimit(req.query.limit, 200)
  const offset = renewalReadOffset(req.query.offset)

  const query: Record<string, unknown> = {}
  if (email) query.email = String(email).toLowerCase().trim()
  if (hasSales === 'true') query.salesCount = { $gt: 0 }
  if (hasSales === 'false') query.salesCount = 0

  const [history, total] = await Promise.all([HotmartSaleHistory.find(query)
    .sort({ latestApprovedDate: -1, _id: -1 })
    .skip(offset)
    .limit(limit)
    .lean()
    .exec(), HotmartSaleHistory.countDocuments(query)])

  res.json({ success: true, data: { total, history, pagination: { limit, offset, total, hasMore: offset + history.length < total } } })
}))

/**
 * POST /api/renewal-hotmart-sales/sync  { emails?: string[] }
 * Sem `emails`, corre para todos os alunos OGI ACTIVE.
 * Com `emails`, restringe a essa lista (re-sync pontual).
 * Espera pela execução protegida e devolve o relatório final.
 */
router.post('/sync', requireRenewalMutationEnabled, asyncRoute(async (req: Request, res: Response) => {
  const emails = normalizeMainParityEmails(req.body?.emails)
  const report = await runMainParityExecution({
    job: 'hotmart-sales-history-sync', payload: { emails }, effect: 'provider-and-local', req, res,
    run: () => syncActiveStudentSalesHistory(emails),
  })
  res.json({ success: true, data: { report } })
}))

export default router
