import { createUserPlatformStatsController } from '../../controllers/users/userPlatformStats.controller'
import { MongooseUserPlatformStatsReader } from './mongooseUserPlatformStats.reader'
import { UserPlatformStatsService } from './userPlatformStats.service'

const service = new UserPlatformStatsService(new MongooseUserPlatformStatsReader())

export const getUserStats = createUserPlatformStatsController(service)
