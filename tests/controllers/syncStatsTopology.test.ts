import * as focused from '../../src/controllers/syncStats/conflicts.controller'
import * as legacy from '../../src/controllers/syncUtilizadoresControllers/syncStats.controller'

describe('sync stats controller topology', () => {
  it.each([
    'getConflicts',
    'getConflictById',
    'resolveConflict',
    'bulkResolveConflicts',
    'autoResolveConflicts',
    'ignoreConflict',
    'getCriticalConflicts'
  ] as const)('keeps %s wired to the focused conflict controller', handler => {
    expect(legacy[handler]).toBe(focused[handler])
  })
})
