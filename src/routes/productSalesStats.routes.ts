// ════════════════════════════════════════════════════════════
// 📁 src/routes/productSalesStats.routes.ts
// ROTAS: Product Sales Stats API
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import { asyncRoute } from '../security/asyncRoute'
import {
  getAllProductSalesStats,
  getProductSalesStatsByProduct,
  getProductSalesByPeriod,
  rebuildProductSalesStatsEndpoint,
  compareProducts
} from '../controllers/products/productSalesStats.controller'

const router = Router()

// ═══════════════════════════════════════════════════════════
// LEITURA DE STATS
// ═══════════════════════════════════════════════════════════

// GET /api/analytics/product-sales - Todos os produtos
router.get('/', asyncRoute(getAllProductSalesStats))

// GET /api/analytics/product-sales/period?startDate=...&endDate=...&productId=...
router.get('/period', asyncRoute(getProductSalesByPeriod))

// GET /api/analytics/product-sales/:productId - Stats de um produto específico
router.get('/:productId', asyncRoute(getProductSalesStatsByProduct))

// ═══════════════════════════════════════════════════════════
// OPERAÇÕES
// ═══════════════════════════════════════════════════════════

// POST /api/analytics/product-sales/rebuild - Rebuild manual
router.post('/rebuild', asyncRoute(rebuildProductSalesStatsEndpoint))

// POST /api/analytics/product-sales/compare - Comparar produtos
// Body: { productIds: ["id1", "id2", "id3"] }
router.post('/compare', asyncRoute(compareProducts))

export default router