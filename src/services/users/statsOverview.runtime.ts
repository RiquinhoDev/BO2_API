import { createStatsOverviewController } from '../../controllers/users/statsOverview.controller'
import { MongooseStatsOverviewReader } from './mongooseStatsOverview.reader'
import { StatsOverviewService } from './statsOverview.service'

const service = new StatsOverviewService(new MongooseStatsOverviewReader())

export const getUsersStatsOverview = createStatsOverviewController(service)
