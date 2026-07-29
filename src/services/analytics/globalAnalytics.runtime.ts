import { createGlobalAnalyticsController } from '../../controllers/analytics/globalAnalytics.controller'
import {
  GlobalAnalyticsService,
  type GlobalAnalyticsData,
} from './globalAnalytics.service'
import { InMemoryTtlCache } from './inMemoryTtlCache'
import { MongooseGlobalAnalyticsReader } from './mongooseGlobalAnalytics.reader'

const cache = new InMemoryTtlCache<GlobalAnalyticsData>(5 * 60 * 1_000)
const reader = new MongooseGlobalAnalyticsReader()
const service = new GlobalAnalyticsService(reader, cache)

export const getGlobalAnalytics = createGlobalAnalyticsController(service)
