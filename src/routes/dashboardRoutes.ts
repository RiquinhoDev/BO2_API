import express from 'express';
import { getDashboardStats, getDashboardStatsV2 } from '../controllers/dashboardController';

const router = express.Router();

/**
 * GET /api/dashboard/stats
 * Retorna estatísticas consolidadas do dashboard (V1)
 */
router.get('/stats', getDashboardStats);

/**
 * GET /api/dashboard/stats/v2
 * Retorna estatísticas usando Architecture V2 (UserProduct)
 */
router.get('/stats/v2', getDashboardStatsV2);

export default router;

