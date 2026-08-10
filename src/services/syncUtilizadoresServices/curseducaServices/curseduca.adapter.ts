export { fetchCurseducaDataForSync } from './curseducaBulkSync.adapter'
export {
  fetchProgressForExistingUsers,
  fetchSingleUserData
} from './curseducaSingleUser.adapter'

import { fetchCurseducaDataForSync } from './curseducaBulkSync.adapter'
import {
  fetchProgressForExistingUsers,
  fetchSingleUserData
} from './curseducaSingleUser.adapter'

export default {
  fetchCurseducaDataForSync,
  fetchSingleUserData,
  fetchProgressForExistingUsers
}