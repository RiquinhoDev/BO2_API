// ════════════════════════════════════════════════════════════
// 📁 src/routes/hotmartSalesHistory.routes.ts
// Sync Hotmart (Fase 1) — histórico de vendas por aluno OGI ativo.
// Endpoints manuais do Backoffice. Escrevem APENAS na nossa BD.
// ════════════════════════════════════════════════════════════

import { Router, type Request, type RequestHandler, type Response } from 'express'
import HotmartSaleHistory from '../models/HotmartSaleHistory'
import { syncActiveStudentSalesHistory } from '../services/renewal/hotmartSalesHistory.service'

const router = Router()

const asyncRoute = (fn: any): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

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

  res.json({
    success: true,
    data: {
      total,
      withSales,
      withoutSales: total - withSales,
      lastSyncedAt: lastSynced?.lastSyncedAt || null
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
 */
router.post('/sync', asyncRoute(async (req: Request, res: Response) => {
  const emails: string[] | undefined = Array.isArray(req.body?.emails)
    ? req.body.emails.filter((e: unknown) => typeof e === 'string' && e.trim())
    : undefined

  const report = await syncActiveStudentSalesHistory(emails)
  res.json({ success: true, data: report })
}))

export default router
