import {
  createCanonicalCronTagsScheduler,
} from '../../../src/services/cron/canonicalCronTagsScheduler.adapter'

const scheduler = {
  getJobById: async () => {
    throw new Error('not used by this test')
  },
  isSchedulerActive: () => false,
  updateJob: async () => {
    throw new Error('not used by this test')
  },
}

test('calculates the requested executions with a real cron parser', () => {
  const adapter = createCanonicalCronTagsScheduler({
    scheduler,
    now: () => new Date('2026-07-29T00:00:00.000Z'),
  })

  expect(adapter.getNextExecutions('0 2 * * *', 3)).toEqual([
    new Date('2026-07-29T01:00:00.000Z'),
    new Date('2026-07-30T01:00:00.000Z'),
    new Date('2026-07-31T01:00:00.000Z'),
  ])
})

test('rejects invalid cron instead of returning an empty valid result', () => {
  const adapter = createCanonicalCronTagsScheduler({
    scheduler,
    now: () => new Date('2026-07-29T00:00:00.000Z'),
  })

  expect(() => adapter.getNextExecutions('invalid', 5)).toThrow()
})
