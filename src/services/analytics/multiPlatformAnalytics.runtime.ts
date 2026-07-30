import { createMultiPlatformAnalyticsController } from '../../controllers/analytics/multiPlatformAnalytics.controller'
import { MongooseMultiPlatformAnalyticsReader } from './mongooseMultiPlatformAnalytics.reader'
import { MultiPlatformAnalyticsService } from './multiPlatformAnalytics.service'

const reader = new MongooseMultiPlatformAnalyticsReader()
const service = new MultiPlatformAnalyticsService(reader)

export const getMultiPlatformAnalytics =
  createMultiPlatformAnalyticsController(service)
