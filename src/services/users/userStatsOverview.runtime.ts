import { createUserStatsOverviewController } from '../../controllers/users/userStatsOverview.controller'
import { MongooseUserStatsOverviewReader } from './mongooseUserStatsOverview.reader'
import { UserStatsOverviewService } from './userStatsOverview.service'

const service = new UserStatsOverviewService(new MongooseUserStatsOverviewReader())

export const getUsersStatsOverview = createUserStatsOverviewController(service)
