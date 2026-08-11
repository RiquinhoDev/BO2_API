// ════════════════════════════════════════════════════════════
// 📁 src/routes/hotmartSalesHistory.routes.ts
// Sync Hotmart (Fase 1) — histórico de vendas por aluno OGI ativo.
// Endpoints manuais do Backoffice. Escrevem APENAS na nossa BD.
//
// A sync pode demorar vários minutos (37+ páginas Hotmart + upsert por
// aluno ativo) — corre em BACKGROUND, não bloqueia o pedido HTTP (senão
// o proxy da Railway corta a ligação por timeout antes de terminar, e
// o browser reporta isso como erro de CORS/502). Progresso visível via
// GET /status (syncInProgress) e GET /history (vai enchendo aos poucos).
// ════════════════════════════════════════════════════════════

import { Router, type Request, type RequestHandler, type Response } from 'express'
import HotmartSaleHistory from '../models/HotmartSaleHistory'
import { syncActiveStudentSalesHistory, type SalesHistorySyncReport } from '../services/renewal/hotmartSalesHistory.service'

const router = Router()

const asyncRoute = (fn: any): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

let syncInProgress = false
let syncStartedAt: Date | null = null
let lastReport: SalesHistorySyncReport | null = null
let lastError: string | null = null

/**
 * GET /api/renewal-hotmart-sales/status
 * Contagens gerais + última sincronização.
 */
router.get('/status', asyncRoute(async (_req: Request, res: Response) => {
  const [total, withSales, lastSynced] = await Promise.all([
    HotmartSaleHistory.countDocuments({}),
    HotmartSaleHistory.countDocuments({ salesCount: { $gt: 0 } }),
    HotmartSaleHistory.findOne({}).sort({ lastSyncedAt: -1 }).select('lastSyncedAt').lean().exec()
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
      syncInProgress,
      syncStartedAt,
      lastReport,
      lastError
    }
  })
}))

/**
 * GET /api/renewal-hotmart-sales/history?email=...&hasSales=true|false&limit=200
 */
router.get('/history', asyncRoute(async (req: Request, res: Response) => {
  const { email, hasSales } = req.query
  const limit = Math.min(Number(req.query.limit) || 200, 1000)

  const query: Record<string, unknown> = {}
  if (email) query.email = String(email).toLowerCase().trim()
  if (hasSales === 'true') query.salesCount = { $gt: 0 }
  if (hasSales === 'false') query.salesCount = 0

  const history = await HotmartSaleHistory.find(query)
    .sort({ latestApprovedDate: -1 })
    .limit(limit)
    .lean()
    .exec()

  res.json({ success: true, data: { total: history.length, history } })
}))

/**
 * POST /api/renewal-hotmart-sales/sync  { emails?: string[] }
 * Sem `emails`, corre para todos os alunos OGI ACTIVE.
 * Com `emails`, restringe a essa lista (re-sync pontual).
 * Dispara e responde de imediato — não espera terminar.
 */
router.post('/sync', asyncRoute(async (req: Request, res: Response) => {
  if (syncInProgress) {
    res.status(409).json({ success: false, message: 'Já há uma sincronização em curso.' })
    return
  }

  const emails: string[] | undefined = Array.isArray(req.body?.emails)
    ? req.body.emails.filter((e: unknown) => typeof e === 'string' && e.trim())
    : undefined

  syncInProgress = true
  syncStartedAt = new Date()
  lastReport = null
  lastError = null

  syncActiveStudentSalesHistory(emails)
    .then((report) => { lastReport = report })
    .catch((err: any) => {
      lastError = err?.message || 'Erro desconhecido na sync'
      console.error('❌ [HotmartSalesSync] Erro em background:', err)
    })
    .finally(() => { syncInProgress = false })

  res.json({
    success: true,
    data: { started: true, message: 'Sincronização iniciada em background — consulta GET /status para acompanhar.' }
  })
}))

export default router
