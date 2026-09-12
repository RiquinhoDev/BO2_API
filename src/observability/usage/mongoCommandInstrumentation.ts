// Conta comandos enviados a Mongo, por coleccao. E a resposta a "quem e que
// esta a martelar a base de dados": o driver ja emite estes eventos quando a
// ligacao e aberta com `monitorCommands`, so temos de os somar.

import type { Connection } from 'mongoose'
import { countUsage, observeUsage } from './usageMeter'
import { USAGE_METRICS } from './usageMetrics'

/** Comandos administrativos que nao representam carga de aplicacao. */
const IGNORED_COMMANDS = new Set([
  'ismaster',
  'hello',
  'ping',
  'endSessions',
  'saslStart',
  'saslContinue',
  'buildInfo',
  'getMore',
])

/**
 * Teto do mapa de comandos em voo. Um comando que nunca termine (ligacao
 * cortada a meio) deixaria a entrada la para sempre; acima deste numero
 * descartamos as mais antigas em vez de deixar a medicao sangrar memoria.
 */
const MAX_IN_FLIGHT = 2_000

interface CommandStartedEvent {
  requestId: number
  commandName: string
  command?: Record<string, unknown>
}

interface CommandFinishedEvent {
  requestId: number
  commandName: string
  duration?: number
}

function asStarted(event: unknown): CommandStartedEvent | null {
  if (typeof event !== 'object' || event === null) return null
  const candidate = event as Partial<CommandStartedEvent>
  if (typeof candidate.requestId !== 'number') return null
  if (typeof candidate.commandName !== 'string') return null
  return candidate as CommandStartedEvent
}

function asFinished(event: unknown): CommandFinishedEvent | null {
  return asStarted(event) as CommandFinishedEvent | null
}

/**
 * O nome da coleccao e o valor do primeiro campo do comando — `{ find: "users",
 * filter: ... }`. Nos comandos administrativos esse valor e o numero 1, e ai
 * nao ha coleccao nenhuma a registar.
 */
export function collectionOfCommand(
  command: Record<string, unknown> | undefined,
  commandName: string,
): string {
  const value = command?.[commandName]
  return typeof value === 'string' ? value : 'admin'
}

export function attachMongoCommandInstrumentation(connection: Connection): () => void {
  const inFlight = new Map<number, { collection: string; commandName: string }>()

  const onStarted = (raw: unknown): void => {
    const event = asStarted(raw)
    if (!event || IGNORED_COMMANDS.has(event.commandName)) return

    if (inFlight.size >= MAX_IN_FLIGHT) {
      const oldest = inFlight.keys().next()
      if (!oldest.done) inFlight.delete(oldest.value)
    }
    inFlight.set(event.requestId, {
      collection: collectionOfCommand(event.command, event.commandName),
      commandName: event.commandName,
    })
  }

  const finish = (raw: unknown, outcome: 'ok' | 'error'): void => {
    const event = asFinished(raw)
    if (!event) return
    const started = inFlight.get(event.requestId)
    if (!started) return
    inFlight.delete(event.requestId)

    const labels = { collection: started.collection, command: started.commandName }
    countUsage(USAGE_METRICS.mongoCommands, { ...labels, outcome })
    if (typeof event.duration === 'number') {
      observeUsage(USAGE_METRICS.mongoLatency, event.duration, labels)
    }
  }

  const onSucceeded = (raw: unknown): void => finish(raw, 'ok')
  const onFailed = (raw: unknown): void => finish(raw, 'error')

  connection.on('commandStarted', onStarted)
  connection.on('commandSucceeded', onSucceeded)
  connection.on('commandFailed', onFailed)

  return () => {
    connection.off('commandStarted', onStarted)
    connection.off('commandSucceeded', onSucceeded)
    connection.off('commandFailed', onFailed)
    inFlight.clear()
  }
}
