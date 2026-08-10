import type {
  Clock,
  StudentStatsReader,
  StudentStatsSource,
} from '../../../src/services/users/studentStats.contract'
import { StudentStatsService } from '../../../src/services/users/studentStats.service'

const NOW = new Date('2026-08-05T00:00:00.000Z')
const clock: Clock = { now: () => NOW }

function source(overrides: Partial<StudentStatsSource> = {}): StudentStatsSource {
  return { discordIds: [], totalProgress: 0, ...overrides }
}

function serviceReturning(value: StudentStatsSource | null): StudentStatsService {
  const reader: StudentStatsReader = { findForStats: jest.fn().mockResolvedValue(value) }
  return new StudentStatsService(reader, clock)
}

test('returns null when the reader finds no student, leaving the 404 to the controller', async () => {
  await expect(serviceReturning(null).get('missing')).resolves.toBeNull()
})

test('derives day counts from the injected clock, not the wall clock', async () => {
  const service = serviceReturning(source({
    hotmartPurchaseDate: new Date('2026-07-06T00:00:00.000Z'),
    combinedLastActivity: new Date('2026-08-04T12:00:00.000Z'),
  }))

  const result = await service.get('student-1')

  expect(result?.daysSincePurchase).toBe(30)
  // Half a day floors to zero: the legacy handler used Math.floor.
  expect(result?.daysSinceLastAccess).toBe(0)
})

test('passes the id through to the reader unchanged', async () => {
  const reader: StudentStatsReader = { findForStats: jest.fn().mockResolvedValue(source()) }
  const service = new StudentStatsService(reader, clock)

  await service.get('507f1f77bcf86cd799439011')

  expect(reader.findForStats).toHaveBeenCalledWith('507f1f77bcf86cd799439011')
})

test('prefers the combined class id and falls back to the legacy field', async () => {
  const canonical = await serviceReturning(
    source({ classId: 'legacy', combinedClassId: 'canonical' }),
  ).get('student-1')
  expect(canonical?.classId).toBe('canonical')

  const fallback = await serviceReturning(source({ classId: 'legacy' })).get('student-1')
  expect(fallback?.classId).toBe('legacy')
  expect(fallback?.hasClass).toBe(true)
})

test('treats a zero progress value as no progress', async () => {
  const result = await serviceReturning(source({ totalProgress: 0 })).get('student-1')

  expect(result?.hasProgress).toBe(false)
  expect(result?.progressPercentage).toBe(0)
})
