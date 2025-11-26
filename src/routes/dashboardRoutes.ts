import express from 'express';
// ✅ DASHBOARD V2 CONTROLLERS - Consolidado + Sprint 1 & 2
import { 
  getDashboardStats,
  getProductsBreakdown, 
  getEngagementDistribution, 
  compareProducts,
  getDashboardStatsV3,  // Sprint 1
  searchDashboard        // Sprint 2
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

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 SPRINT 1: STATS V3 - VERSÃO CONSOLIDADA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/dashboard/stats/v3
 * Stats consolidadas com Health Score e Quick Filters
 */
router.get('/stats/v3', getDashboardStatsV3);

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 SPRINT 2: PESQUISA GLOBAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/dashboard/search?q=termo
 * Pesquisa global por nome, email ou tags
 */
router.get('/search', searchDashboard);

export default router;

