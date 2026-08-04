import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Transport from 'winston-transport'
import logger, { configureLogger, createStructuredLogger } from '../../src/utils/logger'

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

test('logger não consulta variáveis de ambiente quando o transporte é injetado', () => {
  const previousLevel = process.env.LOG_LEVEL
  process.env.LOG_LEVEL = 'error'
  try {
    const transport = new MemoryTransport()
    const logger = createStructuredLogger({ transports: [transport] })

    logger.info('info deve permanecer ativo')

    expect(transport.events).toHaveLength(1)
    expect(transport.events[0].message).toBe('info deve permanecer ativo')
  } finally {
    if (previousLevel === undefined) delete process.env.LOG_LEVEL
    else process.env.LOG_LEVEL = previousLevel
  }
})

test('configureLogger mantém o logger de teste silencioso e sem transportes externos', () => {
  const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-task2-logger-'))
  try {
    configureLogger({
      logLevel: 'debug',
      metricsEnabled: true,
      logDirectory,
      fileLoggingEnabled: false,
      consoleLoggingEnabled: false,
    })

    logger.info('nao deve abrir transporte')

    expect(fs.readdirSync(logDirectory)).toEqual([])
  } finally {
    fs.rmSync(logDirectory, { recursive: true, force: true })
  }
})
