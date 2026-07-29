import { createBenchmarkAnalyticsController } from '../../controllers/analytics/benchmarkAnalytics.controller'
import { BenchmarkAnalyticsService } from './benchmarkAnalytics.service'
import { MongooseBenchmarkAnalyticsReader } from './mongooseBenchmarkAnalytics.reader'

const reader = new MongooseBenchmarkAnalyticsReader()
const service = new BenchmarkAnalyticsService(reader)

export const getBenchmarkAnalytics =
  createBenchmarkAnalyticsController(service)
