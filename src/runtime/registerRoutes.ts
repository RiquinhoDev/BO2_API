import type { RouteRegistrar } from '../bootstrap'
import { asyncRoute } from '../security/asyncRoute'
import { activeCampaignTagRuleDeleteInput } from '../security/activeCampaignDestructiveInput'
import { withValidatedInput } from '../security/validatedInput'
import router from '../routes'
import metricsMiddleware from '../middleware/metrics.middleware'
import metricsRoutes from '../routes/metrics.routes'
import productSalesStatsRoutes from '../routes/productSalesStats.routes'
import activecampaignRoutes from '../routes/ACroutes/activecampaign.routes'
import webhooksRoutes from '../routes/webhooks.routes'
import validationLogsRoutes from '../routes/validationLogs.routes'
import courseLessonsRoutes from '../routes/courseLessons.routes'
import cronManagementRoutes from '../routes/cron/cronManagement.routes'
import businessAnalyticsRoutes from '../routes/businessAnalytics.routes'
import cohortAnalyticsRoutes from '../routes/cohortAnalytics.routes'
import testHistoryRoutes from '../routes/testHistory.routes'
import { localDebugOnly } from '../security/debugRoutes'
import {
  createTagRule, deleteTagRule,
  getAllTagRules, updateTagRule,
} from '../controllers/acTags/activeCampaignLegacyTagRules.controller'
import { getCommunicationHistory } from '../controllers/acTags/activeCampaignHistoryList.controller'
export const registerRoutes: RouteRegistrar = (app) => {
  app.use(metricsMiddleware)
  app.use('/api', router)
  app.use('/api/analytics/cohort', cohortAnalyticsRoutes)
  app.use('/api/analytics/product-sales', productSalesStatsRoutes)
  app.use('/api/business-analytics', businessAnalyticsRoutes)
  app.use('/api/course-lessons', courseLessonsRoutes)
  app.use('/api/metrics', metricsRoutes)
  app.use('/api/activecampaign', activecampaignRoutes)
  app.use('/api/webhooks', webhooksRoutes)
  app.use('/api/form', validationLogsRoutes)
  app.get('/api/tag-rules', asyncRoute(getAllTagRules))
  app.post('/api/tag-rules', asyncRoute(createTagRule))
  app.put('/api/tag-rules/:id', asyncRoute(updateTagRule))
  app.delete('/api/tag-rules/:id', withValidatedInput(activeCampaignTagRuleDeleteInput, (input, req, res, next) => deleteTagRule(input, req, res, next)))
  app.get('/api/communication-history', asyncRoute(getCommunicationHistory))
  app.use('/cron-tags', cronManagementRoutes)
  app.use('/api/test/history', localDebugOnly, testHistoryRoutes)
}
