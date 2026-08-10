// ════════════════════════════════════════════════════════════
// 📊 COHORT ANALYTICS ROUTES
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import { asyncRoute } from '../security/asyncRoute'
import cohortAnalyticsController from '../controllers/cohortAnalytics.controller'

const router = Router()

// GET /api/analytics/cohort
// Query params: productId, platform, startDate, endDate, selectedCohort
router.get(
  '/',
  asyncRoute(cohortAnalyticsController.getCohortAnalysis)
)

export default router