import * as facade from '../../src/controllers/syncUtilizadoresControllers/curseduca.controller'
import * as dashboard from '../../src/controllers/syncUtilizadoresControllers/curseduca/dashboard.controller'
import * as sync from '../../src/controllers/syncUtilizadoresControllers/curseduca/sync.controller'
import * as products from '../../src/controllers/syncUtilizadoresControllers/curseduca/products.controller'
import * as users from '../../src/controllers/syncUtilizadoresControllers/curseduca/users.controller'
import * as legacy from '../../src/controllers/syncUtilizadoresControllers/curseduca/legacy.controller'

describe('CursEduca controller topology', () => {
  it('delegates every public handler to one focused owner', () => {
    expect(facade.getDashboardStats).toBe(dashboard.getDashboardStats)
    expect(facade.getCurseducaDashboardStats).toBe(dashboard.getCurseducaDashboardStats)

    expect(facade.syncCurseducaUsers).toBe(sync.syncCurseducaUsers)
    expect(facade.syncCurseducaUsersUniversal).toBe(sync.syncCurseducaUsers)

    expect(facade.getCurseducaProducts).toBe(products.getCurseducaProducts)
    expect(facade.getCurseducaProductByGroupId).toBe(products.getCurseducaProductByGroupId)
    expect(facade.getCurseducaProductUsers).toBe(products.getCurseducaProductUsers)
    expect(facade.getCurseducaStats).toBe(products.getCurseducaStats)

    expect(facade.getUsersWithClasses).toBe(users.getUsersWithClasses)
    expect(facade.updateUserClasses).toBe(users.updateUserClasses)
    expect(facade.compareSyncMethods).toBe(users.compareSyncMethods)

    expect(facade.getGroups).toBe(legacy.getGroups)
    expect(facade.getMembers).toBe(legacy.getMembers)
    expect(facade.getMemberByEmail).toBe(legacy.getMemberByEmail)
    expect(facade.getAccessReports).toBe(legacy.getAccessReports)
    expect(facade.getCurseducaUsers).toBe(legacy.getCurseducaUsers)
    expect(facade.debugCurseducaAPI).toBe(legacy.debugCurseducaAPI)
    expect(facade.getSyncReport).toBe(legacy.getSyncReport)
    expect(facade.getUserByEmail).toBe(legacy.getUserByEmail)
    expect(facade.cleanupDuplicates).toBe(legacy.cleanupDuplicates)
    expect(facade.syncCurseducaUsersStart).toBe(legacy.syncCurseducaUsersStart)
    expect(facade.getCurseducaSyncStatus).toBe(legacy.getCurseducaSyncStatus)
  })
})
