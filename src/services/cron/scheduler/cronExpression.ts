import schedule from 'node-schedule'
import logger from '../../../utils/logger'

export interface CronExpressionJob {
  cancel(): boolean
  nextInvocation(): Date | null
}

export interface CronScheduleTransport {
  scheduleJob(expression: string, callback: () => void): CronExpressionJob | null
}

export interface CronExpressionService {
  validate(expression: string): void
  calculateNextRun(expression: string): Date
  getNextExecutions(expression: string, count?: number): Date[]
}

const nextWholeHour = (clock: () => Date): Date => {
  const next = new Date(clock())
  next.setHours(next.getHours() + 1, 0, 0, 0)
  return next
}

export const createCronExpressionService = (
  transport: CronScheduleTransport,
  clock: () => Date,
  reportError: (message: string, error: unknown) => void = (message, error) =>
    logger.error(message, error)
): CronExpressionService => ({
  validate(expression: string): void {
    const parts = expression.trim().split(/\s+/)
    if (parts.length < 5 || parts.length > 6) {
      throw new Error(`Cron expression inválida: "${expression}". Deve ter 5 ou 6 campos.`)
    }

    try {
      const testJob = transport.scheduleJob(expression, () => undefined)
      if (!testJob) throw new Error('Expressão inválida')
      testJob.cancel()
    } catch {
      throw new Error(`Cron expression inválida: "${expression}"`)
    }
  },

  calculateNextRun(expression: string): Date {
    const testJob = transport.scheduleJob(expression, () => undefined)
    if (!testJob) return nextWholeHour(clock)

    const nextRun = testJob.nextInvocation()
    testJob.cancel()
    return nextRun ?? nextWholeHour(clock)
  },

  getNextExecutions(expression: string, count = 5): Date[] {
    void count
    try {
      const testJob = transport.scheduleJob(expression, () => undefined)
      if (!testJob) return []

      const firstNext = testJob.nextInvocation()
      testJob.cancel()
      return firstNext ? [firstNext] : []
    } catch (error) {
      reportError('Erro ao calcular próximas execuções:', error)
      return []
    }
  }
})

export const cronExpressionService = createCronExpressionService(schedule, () => new Date())
