// ════════════════════════════════════════════════════════════
// 📊 COHORT ANALYTICS ROUTES
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import cohortAnalyticsController from '../controllers/cohortAnalytics.controller'

const router = Router()

// GET /api/analytics/cohort
// Query params: productId, platform, startDate, endDate, selectedCohort
router.get(
  '/',
  cohortAnalyticsController.getCohortAnalysis
)

export default router