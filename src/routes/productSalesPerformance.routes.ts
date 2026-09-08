// ════════════════════════════════════════════════════════════
// 📁 src/routes/productSalesPerformance.routes.ts
// Desempenho de vendas por produto (OGI + Clareza Mensal/Anual) —
// combinado + individual. A sync do Clareza é pesada (N+1 pedidos à
// Guru) — corre sob receipt durável e devolve o relatório final.
// O progresso e o último resultado ficam disponíveis via GET /status.
// ════════════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express'
import { asyncRoute } from '../security/asyncRoute'
import {
  getProductSalesPerformance,
  syncAllProductSalesPerformance,
} from '../services/products/productSalesPerformance.service'
import { runMainParityExecution } from '../services/renewal/mainParityExecution'
import { getMainParityExecutionStatus } from '../services/renewal/mainParityExecutionStatus'
import { requireRenewalMutationEnabled } from './renewalParityRouteGuards'

const router = Router()


/**
 * GET /api/products-sales-performance/status
 */
router.get('/status', asyncRoute(async (_req: Request, res: Response) => {
  const execution = await getMainParityExecutionStatus('product-sales-performance-sync')
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.json({
    success: true,
    data: { execution }
  })
}))

/**
 * GET /api/products-sales-performance/performance?year=
 */
router.get('/performance', asyncRoute(async (req: Request, res: Response) => {
  const yearRaw = Number(req.query.year)
  const year = Number.isInteger(yearRaw) && yearRaw > 2000 ? yearRaw : undefined
  const data = await getProductSalesPerformance(year)
  res.json({ success: true, data })
}))

/**
 * POST /api/products-sales-performance/sync
 * Sincroniza OGI (Hotmart) + Clareza Mensal + Clareza Anual (Guru).
 * A parte Guru é N+1 (1 pedido por subscritor) — pode demorar minutos.
 */
router.post('/sync', requireRenewalMutationEnabled, asyncRoute(async (req: Request, res: Response) => {
  const report = await runMainParityExecution({
    job: 'product-sales-performance-sync', payload: {}, effect: 'provider-and-local', req, res,
    run: syncAllProductSalesPerformance,
  })
  res.json({ success: true, data: { report } })
}))

export default router
