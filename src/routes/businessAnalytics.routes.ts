// ════════════════════════════════════════════════════════════════════
// 🛣️ BUSINESS ANALYTICS ROUTES
// ════════════════════════════════════════════════════════════════════
// Rotas para métricas de NEGÓCIO (vendas, receita, crescimento)
// Separado de analytics.routes.ts (que foca em turmas/classes)
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express'
import businessAnalyticsController from '../controllers/businessAnalytics.controller'

const router = Router()

// ═══════════════════════════════════════════════════════════════════
// BUSINESS ANALYTICS ROUTES
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/business-analytics/overview
 * 
 * Overview de negócio com KPIs de vendas, receita e crescimento
 */
router.get('/overview', businessAnalyticsController.getBusinessOverview.bind(businessAnalyticsController))

/**
 * GET /api/business-analytics/products/comparison
 * 
 * Comparação de performance entre produtos
 */
router.get('/products/comparison', businessAnalyticsController.getProductComparison.bind(businessAnalyticsController))

/**
 * POST /api/business-analytics/cache/invalidate
 * 
 * Invalidar cache de analytics
 */
router.post('/cache/invalidate', businessAnalyticsController.invalidateCache.bind(businessAnalyticsController))

/**
 * GET /api/business-analytics/cache/stats
 * 
 * Estatísticas do cache
 */
router.get('/cache/stats', businessAnalyticsController.getCacheStats.bind(businessAnalyticsController))

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export default router