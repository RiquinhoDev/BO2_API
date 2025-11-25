import express from 'express';
// ✅ NOVO CONTROLLER ÚNICO - Dashboard V2 Consolidado (25 Nov 2025)
import { 
  getDashboardStats,
  getProductsBreakdown, 
  getEngagementDistribution, 
  compareProducts 
} from '../controllers/dashboard.controller';

const router = express.Router();

/**
 * GET /api/dashboard/stats
 * Retorna estatísticas consolidadas do dashboard V2
 * Suporta filtros avançados: platform, productId, status, progressMin/Max, search
 */
router.get('/stats', getDashboardStats);

// ═══════════════════════════════════════════════════════════
// 🎯 DASHBOARD V2 - NOVOS ENDPOINTS (25 Nov 2025)
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/dashboard/products
 * Breakdown de alunos por produto
 * Query params:
 *   - platform?: string (hotmart, curseduca, discord)
 *   - productId?: string
 *   - status?: string (active, inactive, completed)
 *   - progressMin?: number (0-100)
 *   - progressMax?: number (0-100)
 */
router.get('/products', getProductsBreakdown);

/**
 * GET /api/dashboard/engagement
 * Distribuição de engagement dos alunos
 * Query params:
 *   - platform?: string
 *   - productId?: string
 */
router.get('/engagement', getEngagementDistribution);

/**
 * POST /api/dashboard/compare
 * Compara 2 produtos lado a lado
 * Body:
 *   - productId1: string (required)
 *   - productId2: string (required)
 */
router.post('/compare', compareProducts);

export default router;

