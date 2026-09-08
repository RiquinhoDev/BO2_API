import type { NextFunction, Request, Response } from 'express'

const mockGetJobsByType = jest.fn()
const mockIsScheduledMessagesEnabled = jest.fn()
const mockIsMessagesEnabled = jest.fn()
const mockIsWeeklyTagSnapshotMutableExecutionEnabled = jest.fn()
const mockIsGuruTrialManualExecutionEnabled = jest.fn()
const mockIsRenewalOfferManualExecutionEnabled = jest.fn()
const mockIsCurseducaSyncManualExecutionEnabled = jest.fn()
const mockIsAllSyncManualExecutionEnabled = jest.fn()
const mockWeeklyConfig = jest.fn()

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
jest.mock('../../src/services/requestDrivenRuntimeConfig', () => ({
  isWeeklyTagSnapshotMutableExecutionEnabled: mockIsWeeklyTagSnapshotMutableExecutionEnabled,
  isGuruTrialManualExecutionEnabled: mockIsGuruTrialManualExecutionEnabled,
  isRenewalOfferManualExecutionEnabled: mockIsRenewalOfferManualExecutionEnabled,
  isCurseducaSyncManualExecutionEnabled: mockIsCurseducaSyncManualExecutionEnabled,
  isAllSyncManualExecutionEnabled: mockIsAllSyncManualExecutionEnabled,
}))
jest.mock('../../src/models/tagMonitoring/WeeklyTagMonitoringConfig', () => ({
  __esModule: true,
  default: { getConfig: mockWeeklyConfig },
}))

import { getAllJobs } from '../../src/controllers/syncUtilizadoresControllers/cronManagement/queries.controller'

const job = {
  _id: { toString: () => '507f1f77bcf86cd799439011' },
  name: 'DiscordScheduledMessages',
  syncType: 'discord',
}

const weeklyJob = {
  ...job,
  name: 'WeeklyTagSnapshot',
}
const guruJob = {
  ...job,
  name: 'GuruTrialCheck',
  syncType: 'guru',
}
const renewalOfferJob = {
  ...job,
  name: 'RenewalOfferSync',
  syncType: 'hotmart',
}
const curseducaJob = {
  ...job,
  name: 'Job de CursEduca',
  syncType: 'curseduca',
}
const allJob = {
  ...job,
  name: 'Nightly aggregate',
  syncType: 'all',
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
  mockIsWeeklyTagSnapshotMutableExecutionEnabled.mockReturnValue(false)
  mockIsGuruTrialManualExecutionEnabled.mockReturnValue(true)
  mockIsRenewalOfferManualExecutionEnabled.mockReturnValue(false)
  mockIsCurseducaSyncManualExecutionEnabled.mockReturnValue(false)
  mockIsAllSyncManualExecutionEnabled.mockReturnValue(false)
  mockWeeklyConfig.mockResolvedValue({ enabled: true, scope: 'ALL_CONTACTS' })
})

test('combines the weekly env guard and monitoring kill switch in list view with one config read', async () => {
  mockGetJobsByType.mockResolvedValue([weeklyJob])
  const res = response()

  await getAllJobs(
    { query: { syncType: 'hotmart' } } as unknown as Request,
    res as unknown as Response,
    jest.fn() as NextFunction,
  )

  expect(mockWeeklyConfig).toHaveBeenCalledTimes(1)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      jobs: [expect.objectContaining({
        manualExecution: expect.objectContaining({
          capability: 'weekly-tag-snapshot',
          mutableEnabled: false,
          blockedReason: 'Execução mutável desativada pelo backend',
        }),
      })],
    }),
  }))
})

test('list view fails closed on disabled or unreadable weekly monitoring config', async () => {
  mockGetJobsByType.mockResolvedValue([weeklyJob])
  mockIsWeeklyTagSnapshotMutableExecutionEnabled.mockReturnValue(true)
  mockWeeklyConfig.mockResolvedValueOnce({ enabled: false, scope: 'ALL_CONTACTS' })
  const disabledRes = response()

  await getAllJobs(
    { query: { syncType: 'hotmart' } } as unknown as Request,
    disabledRes as unknown as Response,
    jest.fn() as NextFunction,
  )
  expect(disabledRes.json).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      jobs: [expect.objectContaining({
        manualExecution: expect.objectContaining({
          mutableEnabled: false,
          blockedReason: 'Monitorização semanal desativada',
        }),
      })],
    }),
  }))

  mockWeeklyConfig.mockRejectedValueOnce(new Error('config unavailable'))
  const failedRes = response()
  await getAllJobs(
    { query: { syncType: 'hotmart' } } as unknown as Request,
    failedRes as unknown as Response,
    jest.fn() as NextFunction,
  )
  expect(failedRes.json).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      jobs: [expect.objectContaining({
        manualExecution: expect.objectContaining({
          mutableEnabled: false,
          blockedReason: 'Configuração de monitorização semanal indisponível',
        }),
      })],
    }),
  }))
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

test('list view exposes the exact Guru manual block reason from the backend switch', async () => {
  mockGetJobsByType.mockResolvedValue([guruJob])
  mockIsGuruTrialManualExecutionEnabled.mockReturnValue(false)
  const res = response()

  await getAllJobs(
    { query: { syncType: 'guru' } } as unknown as Request,
    res as unknown as Response,
    jest.fn() as NextFunction,
  )

  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      jobs: [expect.objectContaining({
        manualExecution: expect.objectContaining({
          capability: 'guru-trial-check',
          dryRunSupported: true,
          mutableEnabled: false,
          blockedReason: 'Execução manual dos trials Guru desativada',
        }),
      })],
    }),
  }))
})

test('list view exposes the exact Renewal Offer manual capability and block reason', async () => {
  mockGetJobsByType.mockResolvedValue([renewalOfferJob])
  const res = response()

  await getAllJobs(
    { query: { syncType: 'hotmart' } } as unknown as Request,
    res as unknown as Response,
    jest.fn() as NextFunction,
  )

  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      jobs: [expect.objectContaining({
        manualExecution: expect.objectContaining({
          capability: 'renewal-offer-sync',
          dryRunSupported: true,
          mutableEnabled: false,
          blockedReason: 'Execução manual das ofertas de renovação desativada',
        }),
      })],
    }),
  }))
})

test('list view exposes the exact CursEduca manual switch and block reason', async () => {
  mockGetJobsByType.mockResolvedValue([curseducaJob])
  const res = response()

  await getAllJobs(
    { query: { syncType: 'curseduca' } } as unknown as Request,
    res as unknown as Response,
    jest.fn() as NextFunction,
  )

  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      jobs: [expect.objectContaining({
        manualExecution: expect.objectContaining({
          capability: 'curseduca-sync',
          dryRunSupported: true,
          mutableEnabled: false,
          blockedReason: 'Execução manual do sync CursEduca desativada',
        }),
      })],
    }),
  }))
})

test('list view exposes the aggregate all switch and truthful ON state', async () => {
  mockGetJobsByType.mockResolvedValue([allJob])
  mockIsAllSyncManualExecutionEnabled.mockReturnValue(true)
  const res = response()

  await getAllJobs(
    { query: { syncType: 'all' } } as unknown as Request,
    res as unknown as Response,
    jest.fn() as NextFunction,
  )

  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      jobs: [expect.objectContaining({
        manualExecution: expect.objectContaining({
          capability: 'all-sync',
          dryRunSupported: true,
          mutableEnabled: true,
        }),
      })],
    }),
  }))
})
