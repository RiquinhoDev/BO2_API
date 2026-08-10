export interface ScheduledJob {
  cancel(): boolean
}

export class SchedulerRegistry {
  private readonly jobs = new Map<string, ScheduledJob>()

  register(jobId: string, scheduledJob: ScheduledJob): void {
    this.jobs.get(jobId)?.cancel()
    this.jobs.set(jobId, scheduledJob)
  }

  unregister(jobId: string): void {
    const scheduledJob = this.jobs.get(jobId)
    if (!scheduledJob) return

    scheduledJob.cancel()
    this.jobs.delete(jobId)
  }

  get(jobId: string): ScheduledJob | undefined {
    return this.jobs.get(jobId)
  }

  getAll(): ReadonlyMap<string, ScheduledJob> {
    return this.jobs
  }

  clear(): void {
    this.jobs.forEach(job => job.cancel())
    this.jobs.clear()
  }
}
