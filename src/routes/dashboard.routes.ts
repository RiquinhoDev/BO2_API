import { Router } from 'express';
import {
  getDashboardStatsV3,
  getDashboardProductsBreakdown,
  getEngagementByProductId,
  getProductsComparison,
} from '../controllers/dashboard.controller';
import { rebuildDashboardStatsManual } from '../jobs/rebuildDashboardStats.job';

const router = Router();

// ✅ Stats V3 (Materialized View - RÁPIDO!)
router.get('/stats/v3', getDashboardStatsV3);

// ✅ Products breakdown
router.get('/products', getDashboardProductsBreakdown);

// ✅ Engagement by product
router.get('/engagement', getEngagementByProductId);

// ✅ Products comparison
router.get('/compare', getProductsComparison);

// 🔨 Rebuild manual de Dashboard Stats (útil para debug)
router.post('/stats/v3/rebuild', async (req, res) => {
  try {
    console.log('🔨 [MANUAL] Iniciando rebuild de Dashboard Stats...');
    rebuildDashboardStatsManual();
    res.json({
      success: true,
      message: 'Rebuild iniciado em background. Aguarde ~1 minuto.'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

