import { createClassQuickStatsController } from '../../controllers/analytics/classQuickStats.controller'
import { ClassQuickStatsService } from './classQuickStats.service'
import { MongooseClassQuickStatsReader } from './mongooseClassQuickStats.reader'

const reader = new MongooseClassQuickStatsReader()
const service = new ClassQuickStatsService(reader)

export const getClassQuickStats = createClassQuickStatsController(service)
