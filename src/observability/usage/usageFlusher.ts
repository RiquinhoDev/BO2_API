// Despeja o contador em memoria para o Redis uma vez por minuto. E o unico
// custo de I/O da medicao no caminho normal: um pipeline por minuto por
// replica, independentemente de terem passado dez ou dez mil pedidos.

import logger from '../../utils/logger'
import { usageMeter, type UsageMeter } from './usageMeter'
import { writeUsageDrain, type UsageStoreCommandPort } from './usageStore'

export const USAGE_FLUSH_INTERVAL_MS = 60_000

export interface UsageFlusherDependencies {
  readonly meter?: UsageMeter
  readonly resolvePort: () => UsageStoreCommandPort | null
  readonly intervalMs?: number
  readonly setInterval?: typeof setInterval
  readonly clearInterval?: typeof clearInterval
}

export interface UsageFlusher {
  start(): void
  stop(): void
  flushNow(): Promise<void>
}

export function createUsageFlusher(dependencies: UsageFlusherDependencies): UsageFlusher {
  const meter = dependencies.meter ?? usageMeter
  const intervalMs = dependencies.intervalMs ?? USAGE_FLUSH_INTERVAL_MS
  const schedule = dependencies.setInterval ?? setInterval
  const unschedule = dependencies.clearInterval ?? clearInterval
  let timer: NodeJS.Timeout | null = null
  let warnedAboutMissingPort = false

  const flushNow = async (): Promise<void> => {
    const port = dependencies.resolvePort()
    if (!port) {
      // Sem Redis nao ha onde agregar. Esvaziamos na mesma: guardar o que nao
      // conseguimos entregar so faria a memoria crescer exatamente quando a
      // infraestrutura ja esta em apuros.
      meter.drain()
      if (!warnedAboutMissingPort) {
        warnedAboutMissingPort = true
        logger.warn('Medicao de consumo sem Redis: contagens desta janela descartadas')
      }
      return
    }
    warnedAboutMissingPort = false

    const drain = meter.drain()
    if (drain.counters.length === 0 && drain.histograms.length === 0) return

    try {
      await writeUsageDrain(port, drain)
    } catch (error) {
      logger.error('Falha a escrever consumo no Redis', { error })
    }
  }

  return {
    start(): void {
      if (timer) return
      timer = schedule(() => {
        void flushNow()
      }, intervalMs)
      if (typeof timer.unref === 'function') timer.unref()
    },
    stop(): void {
      if (!timer) return
      unschedule(timer)
      timer = null
    },
    flushNow,
  }
}
