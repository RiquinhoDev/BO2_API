import adapter, {
  fetchCurseducaDataForSync,
  fetchProgressForExistingUsers,
  fetchSingleUserData
} from '../../../src/services/syncUtilizadoresServices/curseducaServices/curseduca.adapter'
import { fetchCurseducaDataForSync as focusedBulk } from '../../../src/services/syncUtilizadoresServices/curseducaServices/curseducaBulkSync.adapter'
import { fetchSingleUserData as focusedSingle } from '../../../src/services/syncUtilizadoresServices/curseducaServices/curseducaSingleUser.adapter'

test('CursEduca adapter keeps its public API through focused flows', () => {
  expect(fetchCurseducaDataForSync).toBe(focusedBulk)
  expect(fetchSingleUserData).toBe(focusedSingle)
  expect(adapter.fetchCurseducaDataForSync).toBe(focusedBulk)
  expect(adapter.fetchSingleUserData).toBe(focusedSingle)
  expect(adapter.fetchProgressForExistingUsers).toBe(fetchProgressForExistingUsers)
})
