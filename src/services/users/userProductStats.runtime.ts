import { createUserProductStatsController } from '../../controllers/users/userProductStats.controller'
import { MongooseUserProductStatsReader } from './mongooseUserProductStats.reader'
import { UserProductStatsService } from './userProductStats.service'

const service = new UserProductStatsService(new MongooseUserProductStatsReader())

export const getProductStats = createUserProductStatsController(service)
