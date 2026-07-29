import {
  cronTagsConfigInput,
  cronTagsHistoryInput,
  cronTagsJobHistoryInput,
  cronTagsStatisticsInput,
  cronTagsValidateInput,
} from '../../src/security/cronTagsInput'

test('config accepts only the explicit update contract', () => {
  expect(cronTagsConfigInput.safeParse({
    params: {},
    query: {},
    body: {
      cronExpression: '0 3 * * *',
      isActive: false,
    },
  }).success).toBe(true)

  expect(cronTagsConfigInput.safeParse({
    params: {},
    query: {},
    body: {
      cronExpression: '0 3 * * *',
      isActive: false,
      role: 'SUPER_ADMIN',
    },
  }).success).toBe(false)
})

test('history normalizes a bounded numeric limit', () => {
  const parsed = cronTagsHistoryInput.parse({
    params: {},
    query: { limit: '200' },
    body: {},
  })

  expect(parsed.query.limit).toBe(200)
  expect(cronTagsHistoryInput.safeParse({
    params: {},
    query: { limit: '201' },
    body: {},
  }).success).toBe(false)
})

test('statistics accepts only a bounded day window', () => {
  expect(cronTagsStatisticsInput.parse({
    params: {},
    query: {},
    body: {},
  }).query.days).toBe(30)

  expect(cronTagsStatisticsInput.safeParse({
    params: {},
    query: { days: '366' },
    body: {},
  }).success).toBe(false)
})

test('job history validates ObjectId params and rejects unknown query fields', () => {
  expect(cronTagsJobHistoryInput.safeParse({
    params: { id: '507f1f77bcf86cd799439011' },
    query: { limit: '20' },
    body: {},
  }).success).toBe(true)

  expect(cronTagsJobHistoryInput.safeParse({
    params: { id: 'not-an-object-id' },
    query: {},
    body: {},
  }).success).toBe(false)

  expect(cronTagsJobHistoryInput.safeParse({
    params: { id: '507f1f77bcf86cd799439011' },
    query: { foo: '1' },
    body: {},
  }).success).toBe(false)
})

test('cron validation rejects fields outside its explicit body', () => {
  expect(cronTagsValidateInput.safeParse({
    params: {},
    query: {},
    body: {
      cronExpression: '0 2 * * *',
      constructor: 'unsafe',
    },
  }).success).toBe(false)
})
