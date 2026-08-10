import SyncReport, { SyncReport as NamedSyncReport } from '../../src/models/SyncModels/SyncReport'
import type { ISyncReport, SyncReportDocument } from '../../src/models/SyncModels/syncReport/contracts'

describe('SyncReport model topology', () => {
  it('preserves named/default model identity after splitting contracts', () => {
    const acceptsContracts = (_report: ISyncReport, _document: SyncReportDocument): void => undefined
    expect(typeof acceptsContracts).toBe('function')
    expect(SyncReport).toBe(NamedSyncReport)
    expect(SyncReport.modelName).toBe('SyncReport')
  })
})
