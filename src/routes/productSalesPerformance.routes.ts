// ════════════════════════════════════════════════════════════
// 📁 src/routes/productSalesPerformance.routes.ts
// Desempenho de vendas por produto (OGI + Clareza Mensal/Anual) —
// combinado + individual. A sync do Clareza é pesada (N+1 pedidos à
// Guru) — corre em BACKGROUND, mesmo padrão já usado no Sync Hotmart
// (evita timeout do proxy Railway). Progresso via GET /status.
// ════════════════════════════════════════════════════════════

import { Router, type Request, type RequestHandler, type Response } from 'express'
import {
  getProductSalesPerformance,
  syncAllProductSalesPerformance,
  type AllProductsSyncReport
} from '../services/products/productSalesPerformance.service'

const router = Router()

const asyncRoute = (fn: any): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

let syncInProgress = false
let syncStartedAt: Date | null = null
let lastReport: AllProductsSyncReport | null = null
let lastError: string | null = null

/**
 * GET /api/products-sales-performance/status
 */
router.get('/status', asyncRoute(async (_req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.json({
    success: true,
    data: { syncInProgress, syncStartedAt, lastReport, lastError }
  })
}))

/**
 * GET /api/products-sales-performance/performance?year=
 */
router.get('/performance', asyncRoute(async (req: Request, res: Response) => {
  const yearRaw = Number(req.query.year)
  const year = Number.isInteger(yearRaw) && yearRaw > 2000 ? yearRaw : undefined
  const data = await getProductSalesPerformance(year)
  res.json(data)
}))

/**
 * POST /api/products-sales-performance/sync
 * Sincroniza OGI (Hotmart) + Clareza Mensal + Clareza Anual (Guru).
 * A parte Guru é N+1 (1 pedido por subscritor) — pode demorar minutos.
 */
router.post('/sync', asyncRoute(async (_req: Request, res: Response) => {
  if (syncInProgress) {
    res.status(409).json({ success: false, message: 'Já há uma sincronização em curso.' })
    return
  }

  syncInProgress = true
  syncStartedAt = new Date()
  lastReport = null
  lastError = null

  syncAllProductSalesPerformance()
    .then((report) => { lastReport = report })
    .catch((err: any) => {
      lastError = err?.message || 'Erro desconhecido na sync'
      console.error('❌ [ProductSalesPerformance] Erro em background:', err)
    })
    .finally(() => { syncInProgress = false })

  res.json({
    success: true,
    data: { started: true, message: 'Sincronização iniciada em background — consulta GET /status para acompanhar.' }
  })
}))

export default router
