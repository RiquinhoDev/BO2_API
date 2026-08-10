import {
  createUsersV2ComparisonController,
  createUsersV2StatsController,
} from '../../controllers/users/usersV2Analytics.controller'
import { MongooseUsersV2ComparisonReader } from './mongooseUsersV2Comparison.reader'
import { MongooseUsersV2StatsReader } from './mongooseUsersV2Stats.reader'
import {
  UsersV2ComparisonService,
  UsersV2StatsService,
  type Clock,
} from './usersV2Analytics.service'

const clock: Clock = {
  now: () => new Date(),
}
const statsService = new UsersV2StatsService(
  new MongooseUsersV2StatsReader(),
  clock,
)
const comparisonService = new UsersV2ComparisonService(
  new MongooseUsersV2ComparisonReader(),
)

export const getUsersV2Stats = createUsersV2StatsController(statsService)
export const getUsersV2Comparison =
  createUsersV2ComparisonController(comparisonService)
