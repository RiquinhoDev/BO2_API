import Transport from 'winston-transport'
import { createStructuredLogger } from '../../../src/utils/logger'
import { createScoreRecalculationObserver } from '../../../src/services/analytics/individualScoreRecalculation.runtime'

class MemoryTransport extends Transport {
  readonly events: Array<Record<PropertyKey, unknown>> = []

  log(info: Record<PropertyKey, unknown>, next: () => void): void {
    this.events.push(info)
    next()
  }
}

describe('individual score recalculation runtime observer', () => {
  it('formats batch failures with a redacted cause, count, and no stable learner IDs', () => {
    const transport = new MemoryTransport()
    const logger = createStructuredLogger({ transports: [transport] })
    const observer = createScoreRecalculationObserver(logger)
    const cause = new Error(
      'private database detail private@example.test token=secret-value',
    )

    observer.writeFailed({
      learnerIds: ['opaque-learner-001', 'opaque-learner-002'],
      cause,
    })

    expect(transport.events).toHaveLength(1)
    expect(transport.events[0]).toMatchObject({
      message: 'Individual score batch write failed',
      failedCount: 2,
      error: {
        message: 'private database detail [REDACTED_EMAIL] token=[REDACTED]',
      },
    })
    expect(transport.events[0]).not.toHaveProperty('learnerIds')
    const formatted = String(
      transport.events[0][Symbol.for('message')],
    )
    expect(formatted).toContain('"failedCount":2')
    expect(formatted).toContain(
      'private database detail [REDACTED_EMAIL] token=[REDACTED]',
    )
    expect(formatted).not.toMatch(
      /opaque-learner-001|opaque-learner-002|private@example\.test|secret-value/,
    )
    logger.close()
  })
})
