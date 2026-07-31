import {
  createUsersV2EnrollmentController,
  createUsersV2LegacyController,
  createUsersV2OverviewAnalyticsController,
} from '../../controllers/users/usersV2List.controller'
import { getUsersForProduct } from '../userProducts/userProductService'
import { MongooseUsersV2EnrollmentReader } from './mongooseUsersV2Enrollment.reader'
import { MongooseUsersV2OverviewAnalyticsReader } from './mongooseUsersV2OverviewAnalytics.reader'
import { UsersV2EnrollmentService } from './usersV2Enrollment.service'
import { UsersV2LegacyService } from './usersV2Legacy.service'
import { UsersV2OverviewAnalyticsService } from './usersV2OverviewAnalytics.service'

const enrollmentService = new UsersV2EnrollmentService(
  new MongooseUsersV2EnrollmentReader(),
)
const legacyService = new UsersV2LegacyService(
  enrollmentService,
  { list: getUsersForProduct },
)
const overviewAnalyticsService = new UsersV2OverviewAnalyticsService(
  new MongooseUsersV2OverviewAnalyticsReader(),
)

export const getUsersV2Enrollments =
  createUsersV2EnrollmentController(enrollmentService)
export const getUsersV2Legacy = createUsersV2LegacyController(legacyService)
export const getUsersV2OverviewAnalytics =
  createUsersV2OverviewAnalyticsController(overviewAnalyticsService)
