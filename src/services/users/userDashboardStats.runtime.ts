import { createUserDashboardStatsController } from '../../controllers/users/userDashboardStats.controller'
import { MongooseUserDashboardStatsReader } from './mongooseUserDashboardStats.reader'
import { UserDashboardStatsService } from './userDashboardStats.service'

const service = new UserDashboardStatsService(new MongooseUserDashboardStatsReader())

export const getDashboardStats = createUserDashboardStatsController(service)
