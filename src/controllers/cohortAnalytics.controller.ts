// ════════════════════════════════════════════════════════════
// 📊 COHORT ANALYTICS CONTROLLER
// ════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import cohortAnalyticsService from '../services/analytics/cohortAnalytics.service'
import { CohortAnalysisFilters } from '../types/cohortTypes'

class CohortAnalyticsController {
  
  // ─────────────────────────────────────────────────────────
  // GET COHORT ANALYSIS
  // ─────────────────────────────────────────────────────────
  
  async getCohortAnalysis(req: Request, res: Response) {
    try {
      const filters: CohortAnalysisFilters = {
        productId: req.query.productId as string,
        platform: req.query.platform as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        selectedCohort: req.query.selectedCohort as string
      }
      
      console.log('📊 [CohortAnalytics] Fetching cohort analysis:', filters)
      
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
      
    } catch (error: any) {
      console.error('❌ [CohortAnalytics] Error:', error)
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch cohort analysis'
      })
    }
  }
}

export default new CohortAnalyticsController()