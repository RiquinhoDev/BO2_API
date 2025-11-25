// ════════════════════════════════════════════════════════════
// 📁 src/routes/dashboard.routes.ts
// ROTAS DO DASHBOARD V2
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import { 
  getProductsStats, 
  getEngagementDistribution, 
  compareProducts 
} from '../controllers/dashboard.controller'

const router = Router()

// ═══════════════════════════════════════════════════════════
// DASHBOARD V2 ENDPOINTS
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/dashboard/products
 * Stats agregadas de todos os produtos
 * Query params:
 *   - platforms: string (comma-separated) - Ex: "hotmart,curseduca"
 */
router.get('/products', getProductsStats)

/**
 * GET /api/dashboard/engagement
 * Distribuição de engagement por faixas
 * Query params:
 *   - productId: string (opcional) - Filtrar por produto
 */
router.get('/engagement', getEngagementDistribution)

/**
 * GET /api/dashboard/compare
 * Comparação entre 2 produtos
 * Query params:
 *   - productId1: string (obrigatório)
 *   - productId2: string (obrigatório)
 */
router.get('/compare', compareProducts)

export default router

