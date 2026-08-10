import dualRead, * as facade from '../../src/services/syncUtilizadoresServices/dualReadService'
import * as runtime from '../../src/services/syncUtilizadoresServices/dualRead/runtime'

describe('dual-read topology', () => {
  it('keeps one runtime owner behind every compatibility export', () => {
    expect(facade.warmUpCache).toBe(runtime.warmUpCache)
    expect(facade.clearUnifiedCache).toBe(runtime.clearUnifiedCache)
    expect(facade.getAllUsersUnified).toBe(runtime.getAllUsersUnified)
    expect(facade.getUniqueUsersFromUnified).toBe(runtime.getUniqueUsersFromUnified)
    expect(facade.getCacheStats).toBe(runtime.getCacheStats)

    expect(dualRead.warmUpCache).toBe(runtime.warmUpCache)
    expect(dualRead.clearUnifiedCache).toBe(runtime.clearUnifiedCache)
    expect(dualRead.getAllUsersUnified).toBe(runtime.getAllUsersUnified)
  })
})
