import Transport from 'winston-transport'
import { createStructuredLogger } from '../../src/utils/logger'

class MemoryTransport extends Transport {
  readonly events: Array<Record<string, unknown>> = []

  log(info: Record<string, unknown>, next: () => void): void {
    this.events.push(info)
    next()
  }
}

test('logger Winston aplica o redator único a todos os níveis e metadata', () => {
  const transport = new MemoryTransport()
  const logger = createStructuredLogger({ level: 'debug', transports: [transport] })
  const metadata = {
    url: '/users/by-email/alice%40example.test?token=segredo',
    authorization: 'Bearer abc.def',
    nested: { token: 'segredo', note: 'Bearer outro-token' },
  }

  logger.debug('debug alice@example.test', metadata)
  logger.info('info alice@example.test', metadata)
  logger.warn('warn alice@example.test', metadata)
  logger.error('error alice@example.test', metadata)

  expect(transport.events).toHaveLength(4)
  for (const event of transport.events) {
    expect(event.message).toMatch(/^(debug|info|warn|error) \[REDACTED_EMAIL\]$/)
    expect(event.url).toBe('/users/by-email/[REDACTED]')
    expect(event.authorization).toBeUndefined()
    expect(event.nested).toEqual({ note: 'Bearer [REDACTED]' })
    const withSymbols = event as Record<PropertyKey, unknown>
    const symbolPayload = Object.getOwnPropertySymbols(event).map((symbol) => withSymbols[symbol])
    expect(JSON.stringify(symbolPayload)).not.toContain('alice%40example.test')
    expect(JSON.stringify(symbolPayload)).not.toContain('abc.def')
    expect(JSON.stringify(symbolPayload)).not.toContain('segredo')
  }
})
