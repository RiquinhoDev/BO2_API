import mongoose from 'mongoose'

jest.mock('../../../src/models/SyncModels/CronJobConfig', () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}))
jest.mock('../../../src/services/requestDrivenRuntimeConfig', () => ({
  isSyncMutableExecutionEnabled: jest.fn(),
  isCronExecutionCleanupMutableExecutionEnabled: jest.fn(),
  isAchievementEvaluationMutableExecutionEnabled: jest.fn(),
}))
jest.mock('../../../src/services/cron/compositeExecution.service', () => ({
  compositeExecutionFingerprint: jest.fn(() => 'derived-fingerprint'),
  runCompositeExecutionWithReceipt: jest.fn(),
}))
jest.mock('../../../src/services/renewal/discordScheduledMessages.service', () => ({
  isScheduledMessagesEnabled: jest.fn(() => true),
}))
jest.mock('../../../src/services/renewal/discord/planning', () => ({
  isMessagesEnabled: jest.fn(() => true),
}))

import CronJobConfig from '../../../src/models/SyncModels/CronJobConfig'
import {
  isAchievementEvaluationMutableExecutionEnabled,
  isCronExecutionCleanupMutableExecutionEnabled,
  isSyncMutableExecutionEnabled,
} from '../../../src/services/requestDrivenRuntimeConfig'
import { runCompositeExecutionWithReceipt } from '../../../src/services/cron/compositeExecution.service'
import { CronManagementService } from '../../../src/services/cron/scheduler/service'
import { isMessagesEnabled } from '../../../src/services/renewal/discord/planning'
import { isScheduledMessagesEnabled } from '../../../src/services/renewal/discordScheduledMessages.service'
import { HttpError } from '../../../src/security/errorHandling'

const findById = jest.mocked(CronJobConfig.findById)
const mutableEnabled = jest.mocked(isSyncMutableExecutionEnabled)
const cleanupEnabled = jest.mocked(isCronExecutionCleanupMutableExecutionEnabled)
const achievementEnabled = jest.mocked(isAchievementEvaluationMutableExecutionEnabled)
const runWithReceipt = jest.mocked(runCompositeExecutionWithReceipt)
const messagesEnabled = jest.mocked(isMessagesEnabled)
const scheduledMessagesEnabled = jest.mocked(isScheduledMessagesEnabled)

function job(syncType: 'pipeline' | 'hotmart' | 'discord' = 'pipeline', name = 'Daily Pipeline') {
  return {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
    name,
    syncType,
    notifications: { enabled: false },
    recordExecution: jest.fn(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mutableEnabled.mockReturnValue(true)
  cleanupEnabled.mockReturnValue(true)
  achievementEnabled.mockReturnValue(true)
  messagesEnabled.mockReturnValue(true)
  scheduledMessagesEnabled.mockReturnValue(true)
  findById.mockResolvedValue(job() as never)
  runWithReceipt.mockImplementation(async (options) => options.run({
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }))
})

test('manual pipeline execution uses the shared durable receipt and forwards phase hooks', async () => {
  const executor = {
    execute: jest.fn(async (_job: unknown, context: { phaseHooks?: unknown }) => {
      expect(context.phaseHooks).toEqual(expect.any(Object))
      return { success: true, duration: 4, stats: { total: 1, inserted: 0, updated: 1, errors: 0, skipped: 0 } }
    }),
  }
  const service = new CronManagementService(executor as never)
  const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')

  await expect(service.executeJobManually(id, id, {
    actorId: 'actor-a',
    requestId: 'pipeline-request-a',
  })).resolves.toMatchObject({ success: true })

  expect(runWithReceipt).toHaveBeenCalledWith(expect.objectContaining({
    operation: 'sync-pipeline',
    identity: 'daily-pipeline',
    actorId: 'actor-a',
    requestId: 'pipeline-request-a',
    fingerprint: 'derived-fingerprint',
  }))
  expect(executor.execute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    triggeredBy: 'MANUAL',
    isolateRecordFailure: true,
    phaseHooks: expect.any(Object),
  }))
})

test('manual cleanup fails closed before receipt claim when its kill switch is off', async () => {
  cleanupEnabled.mockReturnValue(false)
  const executor = { execute: jest.fn() }
  const service = new CronManagementService(executor as never)
  const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')
  findById.mockResolvedValue(job('hotmart', 'CronExecutionCleanup') as never)

  await expect(service.executeJobManually(id, id, {
    actorId: 'actor-a',
    requestId: 'cleanup-disabled',
  })).rejects.toMatchObject({
    code: 'CRON_EXECUTION_CLEANUP_DISABLED',
    status: 503,
  })
  expect(runWithReceipt).not.toHaveBeenCalled()
  expect(executor.execute).not.toHaveBeenCalled()
})

test('automatic cleanup ignores the manual kill switch and uses the shared receipt', async () => {
  cleanupEnabled.mockReturnValue(false)
  const executor = {
    execute: jest.fn(async (_job: unknown, context: { triggeredBy: string; phaseHooks?: unknown }) => {
      expect(context.triggeredBy).toBe('CRON')
      expect(context.phaseHooks).toEqual(expect.any(Object))
      return { success: true, duration: 1, stats: { total: 1, inserted: 0, updated: 1, errors: 0, skipped: 0 } }
    }),
  }
  const service = new CronManagementService(executor as never)
  const scheduledJob = job('hotmart', 'CronExecutionCleanup')

  await expect(
    (service as unknown as { executeScheduledJob(job: unknown): Promise<void> })
      .executeScheduledJob(scheduledJob),
  ).resolves.toBeUndefined()

  expect(cleanupEnabled).not.toHaveBeenCalled()
  expect(runWithReceipt).toHaveBeenCalledWith(expect.objectContaining({
    operation: 'cron-job',
    identity: `cron-job:${scheduledJob._id.toString()}`,
    actorId: 'system:cron',
  }))
})

test('manual achievement evaluation fails closed before receipt claim when disabled', async () => {
  achievementEnabled.mockReturnValue(false)
  const executor = { execute: jest.fn() }
  const service = new CronManagementService(executor as never)
  const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')
  findById.mockResolvedValue(job('hotmart', 'AchievementEvaluation') as never)

  await expect(service.executeJobManually(id, id, {
    actorId: 'actor-a',
    requestId: 'achievement-disabled',
  })).rejects.toMatchObject({
    code: 'ACHIEVEMENT_EVALUATION_DISABLED',
    status: 503,
  })
  expect(runWithReceipt).not.toHaveBeenCalled()
  expect(executor.execute).not.toHaveBeenCalled()
})

test('automatic achievement evaluation ignores the manual kill switch and uses the shared receipt', async () => {
  achievementEnabled.mockReturnValue(false)
  const executor = {
    execute: jest.fn(async (_job: unknown, context: { triggeredBy: string; phaseHooks?: unknown }) => {
      expect(context.triggeredBy).toBe('CRON')
      expect(context.phaseHooks).toEqual(expect.any(Object))
      return { success: true, duration: 1, stats: { total: 1, inserted: 0, updated: 1, errors: 0, skipped: 0 } }
    }),
  }
  const service = new CronManagementService(executor as never)
  const scheduledJob = job('hotmart', 'AchievementEvaluation')

  await expect(
    (service as unknown as { executeScheduledJob(job: unknown): Promise<void> })
      .executeScheduledJob(scheduledJob),
  ).resolves.toBeUndefined()

  expect(achievementEnabled).not.toHaveBeenCalled()
  expect(runWithReceipt).toHaveBeenCalledWith(expect.objectContaining({
    operation: 'cron-job',
    identity: `cron-job:${scheduledJob._id.toString()}`,
    actorId: 'system:cron',
  }))
})

test('manual pipeline execution fails closed before receipt claim when disabled', async () => {
  mutableEnabled.mockReturnValue(false)
  const executor = { execute: jest.fn() }
  const service = new CronManagementService(executor as never)
  const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')

  await expect(service.executeJobManually(id, id, {
    actorId: 'actor-a',
    requestId: 'pipeline-disabled',
  })).rejects.toMatchObject({ code: 'SYNC_PIPELINE_EXECUTION_DISABLED' })
  expect(runWithReceipt).not.toHaveBeenCalled()
  expect(executor.execute).not.toHaveBeenCalled()
})

test('pipeline dry-run bypasses receipt and job/history writes', async () => {
  const executor = {
    execute: jest.fn(async (_job: unknown, context: { dryRun?: boolean }) => ({
      success: true,
      duration: 0,
      stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 },
      dryRun: context.dryRun,
      plan: { operation: 'daily-pipeline', dryRun: true },
    })),
  }
  const service = new CronManagementService(executor as never)
  const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')

  await expect(service.executeJobManually(id, id, { dryRun: true })).resolves.toMatchObject({
    dryRun: true,
    plan: { operation: 'daily-pipeline' },
  })
  expect(runWithReceipt).not.toHaveBeenCalled()
  expect(executor.execute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ dryRun: true }))
})

test('manual Discord scheduled messages use their own capability and durable receipt', async () => {
  const executor = {
    execute: jest.fn(async (_job: unknown, context: { phaseHooks?: unknown }) => {
      expect(context.phaseHooks).toEqual(expect.any(Object))
      return { success: true, duration: 1, stats: { total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0 } }
    }),
  }
  findById.mockResolvedValue(job('discord', 'DiscordScheduledMessages') as never)
  const service = new CronManagementService(executor as never)
  const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')

  await expect(service.executeJobManually(id, id, {
    actorId: 'actor-a',
    requestId: 'discord-request-a',
  })).resolves.toMatchObject({ success: true })

  expect(runWithReceipt).toHaveBeenCalledWith(expect.objectContaining({
    operation: 'cron-job',
    identity: `cron-job:${id.toString()}`,
    actorId: 'actor-a',
    requestId: 'discord-request-a',
    fingerprint: 'derived-fingerprint',
  }))
})

test('automatic implemented pipeline uses the shared receipt without the manual kill switch', async () => {
  mutableEnabled.mockReturnValue(false)
  const executor = {
    execute: jest.fn(async (_job: unknown, context: { triggeredBy: string; phaseHooks?: unknown }) => {
      expect(context.triggeredBy).toBe('CRON')
      expect(context.phaseHooks).toEqual(expect.any(Object))
      return { success: true, duration: 1, stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 } }
    }),
  }
  const service = new CronManagementService(executor as never)
  const scheduledJob = job('pipeline', 'Daily Pipeline')

  await (service as unknown as { executeScheduledJob(job: unknown): Promise<void> })
    .executeScheduledJob(scheduledJob)

  expect(mutableEnabled).not.toHaveBeenCalled()
  expect(runWithReceipt).toHaveBeenCalledWith(expect.objectContaining({
    operation: 'sync-pipeline',
    identity: 'daily-pipeline',
    actorId: 'system:cron',
    requestId: expect.stringMatching(/^cron:/),
  }))
  expect(executor.execute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    triggeredBy: 'CRON',
    isolateRecordFailure: false,
    phaseHooks: expect.any(Object),
  }))
})

test('automatic implemented job absorbs an already-running composite execution', async () => {
  runWithReceipt.mockRejectedValueOnce(new HttpError({
    status: 409,
    code: 'COMPOSITE_EXECUTION_IN_PROGRESS',
    publicMessage: 'job in progress',
  }))
  const executor = { execute: jest.fn() }
  const service = new CronManagementService(executor as never)

  await expect(
    (service as unknown as { executeScheduledJob(job: unknown): Promise<void> })
      .executeScheduledJob(job('pipeline', 'Daily Pipeline')),
  ).resolves.toBeUndefined()
  expect(executor.execute).not.toHaveBeenCalled()
})

test.each([
  ['scheduled switch', true, false],
  ['message switch', false, true],
])('manual Discord execution fails closed when the %s is disabled', async (_label, scheduled, messages) => {
  const executor = { execute: jest.fn() }
  findById.mockResolvedValue(job('discord', 'DiscordScheduledMessages') as never)
  scheduledMessagesEnabled.mockReturnValue(scheduled)
  messagesEnabled.mockReturnValue(messages)
  const service = new CronManagementService(executor as never)
  const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')

  await expect(service.executeJobManually(id, id, {
    actorId: 'actor-a',
    requestId: 'discord-disabled',
  })).rejects.toMatchObject({
    code: 'CRON_DISCORD_SCHEDULED_MESSAGES_DISABLED',
    status: 503,
  })
  expect(runWithReceipt).not.toHaveBeenCalled()
  expect(executor.execute).not.toHaveBeenCalled()
})

test('manual execution generates a fresh request id when the caller omits one', async () => {
  const executor = {
    execute: jest.fn(async () => ({
      success: true,
      duration: 1,
      stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 },
    })),
  }
  const service = new CronManagementService(executor as never)
  const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')

  await service.executeJobManually(id, id, { actorId: 'actor-a' })
  await service.executeJobManually(id, id, { actorId: 'actor-a' })

  const requestIds = runWithReceipt.mock.calls.map(([options]) => options.requestId)
  expect(requestIds).toHaveLength(2)
  expect(requestIds[0]).not.toBe(requestIds[1])
  expect(requestIds[0]).not.toBe(`manual-${id.toString()}`)
  expect(requestIds[1]).not.toBe(`manual-${id.toString()}`)
})

test('manual jobs without a real capability fail closed before executor and receipt', async () => {
  findById.mockResolvedValue(job('hotmart') as never)
  const executor = { execute: jest.fn() }
  const service = new CronManagementService(executor as never)
  const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')

  await expect(service.executeJobManually(id, id, {
    actorId: 'actor-a',
    requestId: 'hotmart-blocked',
  })).rejects.toMatchObject({
    code: 'CRON_JOB_CAPABILITY_BLOCKED',
    status: 503,
  })
  expect(runWithReceipt).not.toHaveBeenCalled()
  expect(executor.execute).not.toHaveBeenCalled()
})
