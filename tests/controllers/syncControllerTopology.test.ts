import * as facade from '../../src/controllers/sync.controller'
import * as operations from '../../src/controllers/sync/operations.controller'
import * as history from '../../src/controllers/sync/history.controller'
import * as status from '../../src/controllers/sync/status.controller'

describe('sync controller topology', () => {
  it('keeps pipeline and platform sync handlers in operations', () => {
    expect(operations.executePipeline).toBe(facade.executePipeline)
    expect(operations.syncHotmartEndpoint).toBe(facade.syncHotmartEndpoint)
    expect(operations.syncCurseducaEndpoint).toBe(facade.syncCurseducaEndpoint)
  })

  it('keeps history handlers in the history module', () => {
    expect(history.getSyncHistory).toBe(facade.getSyncHistory)
    expect(history.getSyncStats).toBe(facade.getSyncStats)
    expect(history.cleanOldHistory).toBe(facade.cleanOldHistory)
    expect(history.retrySyncOperation).toBe(facade.retrySyncOperation)
    expect(history.createSyncRecord).toBe(facade.createSyncRecord)
  })

  it('keeps status in its own module', () => {
    expect(status.getSyncStatus).toBe(facade.getSyncStatus)
  })
})
