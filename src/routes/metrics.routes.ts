// =====================================================
// 📁 src/routes/metrics.routes.ts
// Rotas de métricas do sistema
// =====================================================

import { Router } from 'express'
import { getMetrics, getMetricsHistory, getCronMetrics } from '../controllers/metrics.controller'

const router = Router()

// GET /api/metrics - Métricas atuais e estatísticas
router.get('/', getMetrics)

// GET /api/metrics/history - Histórico de métricas
router.get('/history', getMetricsHistory)

// GET /api/metrics/cron - Métricas dos CRON jobs
router.get('/cron', getCronMetrics)

export default router
