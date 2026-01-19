import express from 'express';
// ✅ DASHBOARD V2 CONTROLLERS - Consolidado + Sprint 1 & 2
import {
  getDashboardStats,
  getProductsBreakdown,
  getEngagementDistribution,
  compareProducts,
  getDashboardStatsV3,  // Sprint 1 (AGORA COM MATERIALIZED VIEW!)
  searchDashboard        // Sprint 2
} from '../controllers/dashboard.controller';
import { rebuildDashboardStatsManual } from '../jobs/rebuildDashboardStats.job';
// 🚀 QUICK ENDPOINTS (otimizados com dados agregados)
import * as quickController from '../controllers/dashboardQuick.controller';

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
 * ⚡ AGORA COM MATERIALIZED VIEW - CARREGA EM < 100ms!
 */
router.get('/stats/v3', getDashboardStatsV3);

/**
 * POST /api/dashboard/stats/v3/rebuild
 * Rebuild manual dos Dashboard Stats (útil para debug)
 */
router.post('/stats/v3/rebuild', async (req, res) => {
  try {
    console.log('🔨 [MANUAL] Iniciando rebuild de Dashboard Stats...');
    rebuildDashboardStatsManual();
    res.json({
      success: true,
      message: 'Rebuild iniciado em background. Aguarde ~60-90 segundos.'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 SPRINT 2: PESQUISA GLOBAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/dashboard/search?q=termo
 * Pesquisa global por nome, email ou tags
 */
router.get('/search', searchDashboard);

// ═══════════════════════════════════════════════════════════════════════════
// ⚡ QUICK ENDPOINTS - Dados agregados (RÁPIDOS!)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/dashboard/quick/product-comparison
 * Comparação rápida de produtos (usa DashboardStats agregado)
 */
router.get('/quick/product-comparison', quickController.getProductComparison);

/**
 * GET /api/dashboard/quick/engagement-heatmap
 * Heatmap de engagement (mock data por agora)
 */
router.get('/quick/engagement-heatmap', quickController.getEngagementHeatmap);

/**
 * GET /api/dashboard/quick/products-breakdown
 * Breakdown rápido por produto
 */
router.get('/quick/products-breakdown', quickController.getProductsBreakdown);

export default router;

