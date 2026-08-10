import {
  CronScheduleTransport,
  createCronExpressionService
} from '../../../src/services/cron/scheduler/cronExpression'

const fixedNow = new Date('2026-08-10T10:37:12.000Z')

const createTransport = (nextInvocation: Date | null) => {
  const cancel = jest.fn(() => true)
  const transport: CronScheduleTransport = {
    scheduleJob: jest.fn(() => ({ cancel, nextInvocation: () => nextInvocation }))
  }
  return { transport, cancel }
}

describe('cron expression service', () => {
  it.each(['0 2 * * *', '0 0 2 * * *'])('validates supported field counts: %s', expression => {
    const { transport, cancel } = createTransport(fixedNow)
    const service = createCronExpressionService(transport, () => fixedNow)

    expect(() => service.validate(expression)).not.toThrow()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it.each(['* * * *', '* * * * * * *'])('rejects unsupported field counts: %s', expression => {
    const { transport } = createTransport(fixedNow)
    const service = createCronExpressionService(transport, () => fixedNow)

    expect(() => service.validate(expression)).toThrow('Deve ter 5 ou 6 campos')
    expect(transport.scheduleJob).not.toHaveBeenCalled()
  })

  it('rejects expressions refused by the scheduler', () => {
    const transport: CronScheduleTransport = { scheduleJob: jest.fn(() => null) }
    const service = createCronExpressionService(transport, () => fixedNow)

    expect(() => service.validate('0 2 * * *')).toThrow('Cron expression inválida')
  })

  it('returns and cancels the next scheduled invocation', () => {
    const next = new Date('2026-08-11T02:00:00.000Z')
    const { transport, cancel } = createTransport(next)
    const service = createCronExpressionService(transport, () => fixedNow)

    expect(service.calculateNextRun('0 2 * * *')).toEqual(next)
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it.each(['missing job', 'missing invocation'])('falls back to the next whole hour for %s', scenario => {
    const { transport } = createTransport(null)
    if (scenario === 'missing job') transport.scheduleJob = jest.fn(() => null)
    const service = createCronExpressionService(transport, () => fixedNow)

    expect(service.calculateNextRun('0 2 * * *')).toEqual(new Date('2026-08-10T11:00:00.000Z'))
  })

  it('preserves the current single-result next-executions contract', () => {
    const next = new Date('2026-08-11T02:00:00.000Z')
    const { transport, cancel } = createTransport(next)
    const service = createCronExpressionService(transport, () => fixedNow)

    expect(service.getNextExecutions('0 2 * * *', 5)).toEqual([next])
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('returns no executions when scheduling fails', () => {
    const transport: CronScheduleTransport = {
      scheduleJob: jest.fn(() => {
        throw new Error('invalid')
      })
    }
    const service = createCronExpressionService(transport, () => fixedNow)

    expect(service.getNextExecutions('invalid')).toEqual([])
  })
})
