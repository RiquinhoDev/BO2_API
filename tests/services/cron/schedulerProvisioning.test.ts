import mongoose from 'mongoose'
import {
  CronJobProvisioner,
  CronProvisioningJob,
  CronProvisioningRepository
} from '../../../src/services/cron/scheduler/jobProvisioning'

const nextRun = new Date('2026-08-10T12:00:00.000Z')

const existingJob = (name: string, cronExpression: string): CronProvisioningJob => ({
  name,
  schedule: { cronExpression },
  nextRun: undefined,
  save: jest.fn(async () => undefined)
})

const repository = (jobs: CronProvisioningJob[] = []) => {
  const byName = new Map(jobs.map(job => [job.name, job]))
  const port: CronProvisioningRepository = {
    findByName: jest.fn(async name => byName.get(name) ?? null),
    create: jest.fn(async () => undefined)
  }
  return port
}

describe('CronJobProvisioner', () => {
  it('creates the five system jobs in their established order', async () => {
    const repo = repository()
    const provisioner = new CronJobProvisioner(repo, () => nextRun)

    await provisioner.ensureSystemJobs()

    expect(repo.create).toHaveBeenCalledTimes(5)
    expect(jest.mocked(repo.create).mock.calls.map(([seed]) => seed.name)).toEqual([
      'RenewalOfferSync',
      'AchievementEvaluation',
      'RenewalAcSync',
      'DiscordRolesSync',
      'DiscordScheduledMessages'
    ])
    expect(jest.mocked(repo.create).mock.calls.map(([seed]) => seed.schedule.enabled)).toEqual([
      true,
      true,
      false,
      false,
      false
    ])
    expect(jest.mocked(repo.create).mock.calls.every(([seed]) =>
      seed.createdBy.equals(new mongoose.Types.ObjectId('000000000000000000000001'))
    )).toBe(true)
  })

  it('updates only the canonical schedule of an existing renewable job', async () => {
    const job = existingJob('RenewalOfferSync', '0 0 * * 0')
    const repo = repository([job])
    const provisioner = new CronJobProvisioner(repo, () => nextRun)

    await provisioner.ensureSystemJobs()

    expect(job.schedule.cronExpression).toBe('0 5 * * *')
    expect(job.nextRun).toEqual(nextRun)
    expect(job.save).toHaveBeenCalledTimes(1)
    expect(repo.create).toHaveBeenCalledTimes(4)
  })

  it('preserves an existing disabled kill-switch job without rewriting it', async () => {
    const job = existingJob('RenewalAcSync', '15 8 * * *')
    const repo = repository([job])
    const provisioner = new CronJobProvisioner(repo, () => nextRun)

    await provisioner.ensureSystemJobs()

    expect(job.schedule.cronExpression).toBe('15 8 * * *')
    expect(job.save).not.toHaveBeenCalled()
    expect(jest.mocked(repo.create).mock.calls.map(([seed]) => seed.name)).not.toContain('RenewalAcSync')
  })
})
