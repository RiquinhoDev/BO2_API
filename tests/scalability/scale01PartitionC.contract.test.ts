import fs from 'node:fs'
import path from 'node:path'
import { collectBatches } from '../../src/utils/collectBatches'

const read = (file: string) => fs.readFileSync(path.resolve(file), 'utf8')
const method = (source: string, start: string, end?: string) => {
  const from = source.indexOf(start)
  const to = end ? source.indexOf(end, from + start.length) : source.length
  if (from < 0 || to < 0) throw new Error(`Missing method boundary: ${start}`)
  return source.slice(from, to)
}

const expectCappedStableRead = (source: string, fields: string) => {
  expect(source).toContain('boundedQueryLimit')
  expect(source).toMatch(/\.limit\(cappedLimit\)/)
  expect(source).toContain(fields)
}

const expectCompleteBatchScan = (source: string, fields: string) => {
  expect(source).toContain('collectBatches')
  expect(source).toContain('boundedQueryLimit')
  expect(source).toMatch(/\.limit\(batchSize\)/)
  expect(source).toContain(fields)
}

test('weekly snapshots and inactivation helpers bound reads without truncating executable scans', () => {
  const weekly = read('src/models/tagMonitoring/WeeklyNativeTagSnapshot.ts')
  expectCompleteBatchScan(method(weekly, 'statics.findByWeek', 'statics.findPreviousSnapshot'), 'sort({ _id: 1 })')

  const inactivation = read('src/models/InactivationList.ts')
  expectCappedStableRead(method(inactivation, 'statics.findPending', 'statics.findExecutable'), 'sort({ createdAt: -1, _id: -1 })')
  expectCompleteBatchScan(method(inactivation, 'statics.findExecutable', 'statics.findRevertible'), 'sort({ _id: 1 })')
  expectCappedStableRead(method(inactivation, 'statics.findRevertible', 'const InactivationList'), 'sort({ createdAt: -1, _id: -1 })')
})

test('engagement helpers cap state lists and batch the complete evaluation set', () => {
  const source = read('src/models/StudentEngagementState.ts')
  expectCappedStableRead(method(source, 'async findByState', 'async findEligibleForEvaluation'), 'sort({ daysSinceLastLogin: -1, _id: -1 })')
  expectCompleteBatchScan(method(source, 'async findEligibleForEvaluation', 'StudentEngagementStateSchema.pre'), 'sort({ _id: 1 })')
})

test('sync report and history recent reads cap at 200 with stable tie-breakers', () => {
  const report = read('src/models/SyncModels/SyncReport.ts')
  expectCappedStableRead(method(report, 'statics.findRecent', 'statics.getAggregatedStats'), 'sort({ startedAt: -1, _id: -1 })')

  const history = read('src/models/SyncModels/SyncHistory.ts')
  expectCappedStableRead(method(history, 'statics.getRecentSyncs', 'statics.getActiveSyncs'), 'sort({ startedAt: -1, _id: -1 })')
})

test('activity snapshots use a complete composite-cursor scan', () => {
  const source = read('src/models/SyncModels/ActivitySnapshot.ts')
  const snapshots = method(source, 'statics.getUserSnapshots', 'statics.getActiveUsersInMonth')
  expectCompleteBatchScan(snapshots, 'sort({ snapshotMonth: 1, _id: 1 })')
  expect(snapshots).toContain("{ snapshotMonth: cursor.snapshotMonth, _id: { $gt: cursor._id } }")
})

test('sync conflict list helpers cap requests and use stable ordering', () => {
  const source = read('src/models/SyncModels/SyncConflict.ts')
  expectCappedStableRead(method(source, 'statics.getPendingConflicts', 'statics.getConflictStats'), 'sort({ severity: -1, detectedAt: -1, _id: -1 })')
  expectCappedStableRead(method(source, 'statics.getCriticalConflicts', 'statics.getOldPendingConflicts'), 'sort({ detectedAt: -1, _id: -1 })')
})
test('complete scans retain every record while every request stays bounded', async () => {
  const records = Array.from({ length: 10_000 }, (_, index) => index + 1)
  const requestedBatchSizes: number[] = []

  const result = await collectBatches(
    200,
    async (cursor: number | undefined, batchSize) => {
      requestedBatchSizes.push(batchSize)
      const startIndex = cursor ?? 0
      return records.slice(startIndex, startIndex + batchSize)
    },
    record => record,
  )

  expect(result).toEqual(records)
  expect(new Set(result).size).toBe(records.length)
  expect(requestedBatchSizes).toHaveLength(51)
  expect(requestedBatchSizes.every(size => size <= 200)).toBe(true)
})