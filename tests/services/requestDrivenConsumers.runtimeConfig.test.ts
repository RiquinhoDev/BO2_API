import axios from 'axios'
import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../src/config/runtimeConfig'
import notificationService from '../../src/services/notification.service'
import { isValidSummaryAccessToken } from '../../src/services/studentOgiSummary.service'
import { createTestRuntimeConfig } from '../support/runtimeConfig'

jest.mock('axios')

const originalSlackUrl = process.env.SLACK_WEBHOOK_URL
const originalSummaryToken = process.env.STUDENT_SUMMARY_TOKEN

afterEach(() => {
  jest.clearAllMocks()
  resetRuntimeConfigForTests()
  if (originalSlackUrl === undefined) delete process.env.SLACK_WEBHOOK_URL
  else process.env.SLACK_WEBHOOK_URL = originalSlackUrl
  if (originalSummaryToken === undefined) delete process.env.STUDENT_SUMMARY_TOKEN
  else process.env.STUDENT_SUMMARY_TOKEN = originalSummaryToken
})

test('notification sends only to the configured Slack webhook', async () => {
  const base = createTestRuntimeConfig()
  initializeRuntimeConfig({
    ...base,
    integrations: {
      ...base.integrations,
      slack: { configured: true, value: { webhookUrl: 'https://slack.runtime.invalid' } },
    },
  })
  process.env.SLACK_WEBHOOK_URL = 'https://slack.ambient.invalid'
  jest.mocked(axios.post).mockResolvedValue({ data: { ok: true } })

  await notificationService.sendSlackAlert('runtime only')

  expect(axios.post).toHaveBeenCalledWith(
    'https://slack.runtime.invalid',
    expect.objectContaining({ attachments: expect.any(Array) }),
  )
})

test('notification stays inert when Slack is unconfigured', async () => {
  initializeRuntimeConfig(createTestRuntimeConfig())
  process.env.SLACK_WEBHOOK_URL = 'https://slack.ambient.invalid'

  await notificationService.sendSlackAlert('must not leave the process')

  expect(axios.post).not.toHaveBeenCalled()
})

test('student summary token comparison ignores ambient env and rejects length mismatch', () => {
  const base = createTestRuntimeConfig()
  initializeRuntimeConfig({
    ...base,
    integrations: {
      ...base.integrations,
      studentSummary: { configured: true, value: { token: 'runtime-summary-token' } },
    },
  })
  process.env.STUDENT_SUMMARY_TOKEN = 'ambient-summary-token'

  expect(isValidSummaryAccessToken('runtime-summary-token')).toBe(true)
  expect(isValidSummaryAccessToken('ambient-summary-token')).toBe(false)
  expect(isValidSummaryAccessToken('short')).toBe(false)
})
