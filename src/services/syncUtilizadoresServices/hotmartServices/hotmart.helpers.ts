export * from './hotmart/transport'
export * from './hotmart/processing'
export * from './hotmart/modules'

import { fetchAllHotmartUsers, fetchBatchUserProgress, fetchUserLessons, getHotmartAccessToken } from './hotmart/transport'
import { calculateProgress, convertUnixTimestamp, normalizeEngagementLevel, normalizeHotmartUser, validateHotmartUser } from './hotmart/processing'
import { calculateModuleProgress, fetchCourseModules } from './hotmart/modules'

export default {
  getHotmartAccessToken,
  fetchAllHotmartUsers,
  fetchUserLessons,
  fetchBatchUserProgress,
  calculateProgress,
  convertUnixTimestamp,
  normalizeEngagementLevel,
  normalizeHotmartUser,
  validateHotmartUser,
  fetchCourseModules,
  calculateModuleProgress
}