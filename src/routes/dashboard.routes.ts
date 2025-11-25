import { Router } from 'express';
import {
  getDashboardStats,
  getProductsBreakdown,
  getEngagementDistribution,
  compareProducts
} from '../controllers/dashboard.controller';

const router = Router();

// ═══════════════════════════════════════════════════════
// 📊 ROTAS DO DASHBOARD V2 (SUBSTITUI VISÃO GERAL)
// ═══════════════════════════════════════════════════════

/**
 * GET /api/dashboard/stats
 * Estatísticas gerais para a Visão Geral (Dashboard V2)
 * 
 * Query params:
 * - platform?: string (hotmart, curseduca, discord)
 * - productId?: string
 * - status?: string (active, inactive, completed)
 * - progressMin?: number (0-100)
 * - progressMax?: number (0-100)
 * - search?: string (procurar por nome ou email)
 */
router.get('/stats', getDashboardStats);

/**
 * GET /api/dashboard/products
 * Breakdown de alunos por produto (Tab "Por Produto")
 * 
 * Query params:
 * - platform?: string
 * - productId?: string
 * - status?: string
 * - progressMin?: number
 * - progressMax?: number
 */
router.get('/products', getProductsBreakdown);

/**
 * GET /api/dashboard/engagement
 * Distribuição de engagement dos alunos (Tab "Engagement")
 * 
 * Query params:
 * - platform?: string
 * - productId?: string
 */
router.get('/engagement', getEngagementDistribution);

/**
 * POST /api/dashboard/compare
 * Compara 2 produtos lado a lado (Tab "Comparar")
 * 
 * Body:
 * - productId1: string (required)
 * - productId2: string (required)
 */
router.post('/compare', compareProducts);

export default router;
