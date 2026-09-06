import type { NextFunction, Request, Response } from 'express'

const mockGetJobsByType = jest.fn()
const mockIsScheduledMessagesEnabled = jest.fn()
const mockIsMessagesEnabled = jest.fn()

jest.mock('../../src/services/cron/scheduler', () => ({
  __esModule: true,
  default: { getJobsByType: mockGetJobsByType },
}))
jest.mock('../../src/services/renewal/discordScheduledMessages.service', () => ({
  isScheduledMessagesEnabled: mockIsScheduledMessagesEnabled,
}))
jest.mock('../../src/services/renewal/discord/planning', () => ({
  isMessagesEnabled: mockIsMessagesEnabled,
}))

import { getAllJobs } from '../../src/controllers/syncUtilizadoresControllers/cronManagement/queries.controller'

const job = {
  _id: { toString: () => '507f1f77bcf86cd799439011' },
  name: 'DiscordScheduledMessages',
  syncType: 'discord',
}

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetJobsByType.mockResolvedValue([job])
  mockIsScheduledMessagesEnabled.mockReturnValue(true)
  mockIsMessagesEnabled.mockReturnValue(true)
})

test.each([
  ['scheduled switch', false, true],
  ['message switch', true, false],
])('marks manual Discord execution disabled when the %s is off', async (_label, scheduled, messages) => {
  mockIsScheduledMessagesEnabled.mockReturnValue(scheduled)
  mockIsMessagesEnabled.mockReturnValue(messages)
  const res = response()

  await getAllJobs(
    { query: { syncType: 'discord' } } as unknown as Request,
    res as unknown as Response,
    jest.fn() as NextFunction,
  )

  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      jobs: [expect.objectContaining({
        manualExecution: expect.objectContaining({ mutableEnabled: false }),
      })],
    }),
  }))
})
