// ════════════════════════════════════════════════════════════
// 📊 COHORT ANALYTICS CONTROLLER
// ════════════════════════════════════════════════════════════

import logger from '../utils/logger'
import { type NextFunction, Request, Response } from 'express'
import { IntegrationUnavailableError } from '../errors/integrationUnavailableError'
import cohortAnalyticsService from '../services/analytics/cohortAnalytics.service'
import { CohortAnalysisFilters } from '../types/cohortTypes'
import { internalError } from '../security/errorHandling'

function forwardCohortError(next: NextFunction, error: unknown): void {
  if (error instanceof IntegrationUnavailableError) {
    next(error)
    return
  }
  next(internalError(
    'Failed to fetch cohort analysis',
    'COHORT_ANALYTICS_READ_FAILED',
    error,
  ))
}

class CohortAnalyticsController {
  
  // ─────────────────────────────────────────────────────────
  // GET COHORT ANALYSIS
  // ─────────────────────────────────────────────────────────
  
  async getCohortAnalysis(req: Request, res: Response, next: NextFunction) {
    try {
      const filters: CohortAnalysisFilters = {
        productId: req.query.productId as string,
        platform: req.query.platform as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        selectedCohort: req.query.selectedCohort as string
      }
      
      logger.info('📊 [CohortAnalytics] Fetching cohort analysis:', filters)
      
      // 1. Calcular heatmap data
      const heatmapData = await cohortAnalyticsService.calculateCohortRetention(filters)
      
      // 2. Se selecionou cohort específico, buscar métricas
      let selectedCohortMetrics = undefined
      
      if (filters.selectedCohort) {
        selectedCohortMetrics = await cohortAnalyticsService.calculateCohortMetrics(
          filters.selectedCohort,
          filters
        )
      }
      
      // 3. Calcular summary
      const summary = await cohortAnalyticsService.calculateSummary(heatmapData)
      
      return res.status(200).json({
        success: true,
        data: {
          heatmapData,
          selectedCohortMetrics,
          summary
        }
      })
      
    } catch (error: unknown) {
      forwardCohortError(next, error)
    }
  }
}

export default new CohortAnalyticsController()