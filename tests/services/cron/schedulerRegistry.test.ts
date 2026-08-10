import { SchedulerRegistry, ScheduledJob } from '../../../src/services/cron/scheduler/registry'

const createJob = (): ScheduledJob & { cancel: jest.Mock<boolean, []> } => ({
  cancel: jest.fn(() => true)
})

describe('SchedulerRegistry', () => {
  it('cancels the previous job when replacing the same id', () => {
    const registry = new SchedulerRegistry()
    const first = createJob()
    const replacement = createJob()

    registry.register('job-1', first)
    registry.register('job-1', replacement)

    expect(first.cancel).toHaveBeenCalledTimes(1)
    expect(replacement.cancel).not.toHaveBeenCalled()
    expect(registry.get('job-1')).toBe(replacement)
  })

  it('cancels and removes a registered job', () => {
    const registry = new SchedulerRegistry()
    const job = createJob()

    registry.register('job-1', job)
    registry.unregister('job-1')

    expect(job.cancel).toHaveBeenCalledTimes(1)
    expect(registry.get('job-1')).toBeUndefined()
  })

  it('ignores unregister for an unknown job', () => {
    const registry = new SchedulerRegistry()

    expect(() => registry.unregister('missing')).not.toThrow()
  })

  it('cancels every job before clearing the registry', () => {
    const registry = new SchedulerRegistry()
    const first = createJob()
    const second = createJob()

    registry.register('job-1', first)
    registry.register('job-2', second)
    registry.clear()

    expect(first.cancel).toHaveBeenCalledTimes(1)
    expect(second.cancel).toHaveBeenCalledTimes(1)
    expect(registry.getAll().size).toBe(0)
  })

  it('exposes registered jobs through a readonly view', () => {
    const registry = new SchedulerRegistry()
    const job = createJob()

    registry.register('job-1', job)

    expect([...registry.getAll()]).toEqual([['job-1', job]])
  })
})
