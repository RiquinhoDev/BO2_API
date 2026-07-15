import type { RouteRegistrar } from '../bootstrap'
import router from '../routes'
import metricsMiddleware from '../middleware/metrics.middleware'
import metricsRoutes from '../routes/metrics.routes'
import productSalesStatsRoutes from '../routes/productSalesStats.routes'
import activecampaignRoutes from '../routes/ACroutes/activecampaign.routes'
import webhooksRoutes from '../routes/webhooks.routes'
import healthRoutes from '../routes/health.routes'
import validationLogsRoutes from '../routes/validationLogs.routes'
import courseLessonsRoutes from '../routes/courseLessons.routes'
import cronManagementRoutes from '../routes/cron/cronManagement.routes'
import businessAnalyticsRoutes from '../routes/businessAnalytics.routes'
import cohortAnalyticsRoutes from '../routes/cohortAnalytics.routes'
import testHistoryRoutes from '../routes/testHistory.routes'
import { localDebugOnly } from '../security/debugRoutes'
import {
  createTagRule,
  deleteTagRule,
  getAllTagRules,
  getCommunicationHistory,
  updateTagRule,
} from '../controllers/acTags/activecampaign.controller'

export const registerRoutes: RouteRegistrar = (app) => {
  app.use(metricsMiddleware)
  app.use('/api', router)
  app.use('/api/analytics/cohort', cohortAnalyticsRoutes)
  app.use('/api/analytics/product-sales', productSalesStatsRoutes)
  app.use('/api/business-analytics', businessAnalyticsRoutes)
  app.use('/api/course-lessons', courseLessonsRoutes)
  app.use('/api/metrics', metricsRoutes)
  app.use('/api', healthRoutes)
  app.use('/api/activecampaign', activecampaignRoutes)
  app.use('/api/webhooks', webhooksRoutes)
  app.use('/api/form', validationLogsRoutes)
  app.get('/api/tag-rules', getAllTagRules)
  app.post('/api/tag-rules', createTagRule)
  app.put('/api/tag-rules/:id', updateTagRule)
  app.delete('/api/tag-rules/:id', deleteTagRule)
  app.get('/api/communication-history', getCommunicationHistory)
  app.use('/cron-tags', cronManagementRoutes)
  app.use('/api/test/history', localDebugOnly, testHistoryRoutes)
}
