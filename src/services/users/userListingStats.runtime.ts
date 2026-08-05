import { createUserListingStatsController } from '../../controllers/users/userListingStats.controller'
import { MongooseUserListingStatsReader } from './mongooseUserListingStats.reader'
import { UserListingStatsService } from './userListingStats.service'

const service = new UserListingStatsService(new MongooseUserListingStatsReader())

export const getUsersInfiniteStats = createUserListingStatsController(service)
