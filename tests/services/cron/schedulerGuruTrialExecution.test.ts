import mongoose from 'mongoose'

jest.mock('../../../src/models/SyncModels/CronJobConfig', () => ({
  __esModule: true,
  default: { findById: jest.fn(), findOne: jest.fn() },
}))
jest.mock('../../../src/services/requestDrivenRuntimeConfig', () => ({
  isGuruTrialManualExecutionEnabled: jest.fn(),
}))
jest.mock('../../../src/services/cron/compositeExecution.service', () => ({
  compositeExecutionFingerprint: jest.fn(() => 'derived-fingerprint'),
  runCompositeExecutionWithReceipt: jest.fn(),
}))

import CronJobConfig from '../../../src/models/SyncModels/CronJobConfig'
import { isGuruTrialManualExecutionEnabled } from '../../../src/services/requestDrivenRuntimeConfig'
import { runCompositeExecutionWithReceipt } from '../../../src/services/cron/compositeExecution.service'
import { CronManagementService } from '../../../src/services/cron/scheduler/service'

const findById = jest.mocked(CronJobConfig.findById)
const guruEnabled = jest.mocked(isGuruTrialManualExecutionEnabled)
const runWithReceipt = jest.mocked(runCompositeExecutionWithReceipt)

function job() {
  return {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
    name: 'GuruTrialCheck',
    syncType: 'hotmart',
    notifications: { enabled: false },
    recordExecution: jest.fn(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  guruEnabled.mockReturnValue(true)
  findById.mockResolvedValue(job() as never)
  runWithReceipt.mockImplementation(async (options) => options.run({
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }))
})

test('GuruTrialCheck manual live execution uses the shared receipt and forwards phase hooks', async () => {
  const executor = {
    execute: jest.fn(async (_job: unknown, context: { phaseHooks?: unknown }) => {
      expect(context.phaseHooks).toEqual(expect.any(Object))
      return { success: true, duration: 1, stats: { total: 1, inserted: 0, updated: 1, errors: 0, skipped: 0 } }
    }),
  }
  const service = new CronManagementService(executor as never)
  const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')

  await expect(service.executeJobManually(id, id, {
    actorId: 'actor-guru',
    requestId: 'guru-request-a',
  })).resolves.toMatchObject({ success: true })

  expect(runWithReceipt).toHaveBeenCalledWith(expect.objectContaining({
    operation: 'cron-job',
    identity: `cron-job:${id.toString()}`,
    actorId: 'actor-guru',
    requestId: 'guru-request-a',
  }))
  expect(executor.execute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    triggeredBy: 'MANUAL',
    phaseHooks: expect.any(Object),
  }))
})

test('GuruTrialCheck manual live execution fails closed before receipt when disabled', async () => {
  guruEnabled.mockReturnValue(false)
  const executor = { execute: jest.fn() }
  const service = new CronManagementService(executor as never)
  const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')

  await expect(service.executeJobManually(id, id, { requestId: 'guru-disabled' }))
    .rejects.toMatchObject({
      code: 'GURU_TRIAL_MANUAL_EXECUTION_DISABLED',
      status: 503,
    })
  expect(runWithReceipt).not.toHaveBeenCalled()
  expect(executor.execute).not.toHaveBeenCalled()
})

test('GuruTrialCheck dry-run bypasses receipt and forwards the read-only option', async () => {
  const executor = {
    execute: jest.fn(async (_job: unknown, context: { dryRun?: boolean }) => ({
      success: true,
      duration: 0,
      stats: { total: 1, inserted: 0, updated: 0, errors: 0, skipped: 0 },
      dryRun: context.dryRun,
      plan: { operation: 'guru-trial-check', dryRun: true },
    })),
  }
  const service = new CronManagementService(executor as never)
  const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')

  await expect(service.executeJobManually(id, id, { dryRun: true })).resolves.toMatchObject({
    dryRun: true,
    plan: { operation: 'guru-trial-check' },
  })
  expect(runWithReceipt).not.toHaveBeenCalled()
  expect(executor.execute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ dryRun: true }))
})

test('automatic GuruTrialCheck ignores the manual switch and keeps the scheduled receipt path', async () => {
  guruEnabled.mockReturnValue(false)
  const executor = {
    execute: jest.fn(async (_job: unknown, context: { triggeredBy: string; phaseHooks?: unknown }) => {
      expect(context.triggeredBy).toBe('CRON')
      expect(context.phaseHooks).toEqual(expect.any(Object))
      return { success: true, duration: 1, stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 } }
    }),
  }
  const service = new CronManagementService(executor as never)
  const scheduledJob = job()

  await (service as unknown as { executeScheduledJob(job: unknown): Promise<void> })
    .executeScheduledJob(scheduledJob)

  expect(guruEnabled).not.toHaveBeenCalled()
  expect(runWithReceipt).toHaveBeenCalledWith(expect.objectContaining({
    operation: 'cron-job',
    identity: `cron-job:${scheduledJob._id.toString()}`,
    actorId: 'system:cron',
  }))
})
