// Liga e desliga a medicao de consumo: o despejo periodico dos contadores para
// o Redis, o vigia do event loop e o cron que fecha cada hora num snapshot.
//
// Vive fora do sistema de cron de negocio de proposito: isto e infraestrutura e
// tem de continuar a medir mesmo com o scheduler desligado — sobretudo ai, que
// e quando alguem esta a investigar um problema.

import cron, { type ScheduledTask } from 'node-cron'
import logger from '../utils/logger'
import { cacheService } from '../services/cache.service'
import { createUsageFlusher, type UsageFlusher } from '../observability/usage/usageFlusher'
import {
  startEventLoopMonitor,
  stopEventLoopMonitor,
} from '../services/ops/probes/processProbe'
import {
  captureUsageSnapshot,
  previousHour,
} from '../services/ops/usageSnapshot.service'

/** Hora UTC cujo fecho arrasta o detalhe caro (tamanhos por coleccao, Railway). */
export const DEEP_SNAPSHOT_HOUR = 4

/** Minuto 5: da folga para todas as replicas terem despejado a hora anterior. */
const HOURLY_SNAPSHOT_CRON = '5 * * * *'

let flusher: UsageFlusher | null = null
let snapshotTask: ScheduledTask | null = null

function resolveUsageStorePort() {
  return cacheService.isReady() ? cacheService.getUsageStoreCommandPort() : null
}

export async function runUsageSnapshot(now: Date = new Date()): Promise<void> {
  const hour = previousHour(now)
  const deep = Number(hour.slice(11, 13)) === DEEP_SNAPSHOT_HOUR

  // O despejo vem antes do snapshot: sem ele, a ultima janela de contagens
  // desta replica ficava de fora da hora que estamos precisamente a fechar.
  await flusher?.flushNow()

  const saved = await captureUsageSnapshot({ hour, deep })
  if (saved) {
    logger.info(`📊 Snapshot de consumo gravado para ${hour}${deep ? ' (detalhado)' : ''}`)
  }
}

export function startUsageMeasurement(): void {
  startEventLoopMonitor()

  if (!flusher) {
    flusher = createUsageFlusher({ resolvePort: resolveUsageStorePort })
    flusher.start()
  }

  if (!snapshotTask) {
    snapshotTask = cron.schedule(HOURLY_SNAPSHOT_CRON, () => {
      void runUsageSnapshot().catch((error) => {
        logger.error('Erro ao gravar snapshot de consumo', { error })
      })
    })
  }

  logger.info('📊 Medicao de consumo activa')
}

export function stopUsageMeasurement(): void {
  flusher?.stop()
  flusher = null
  snapshotTask?.stop()
  snapshotTask = null
  stopEventLoopMonitor()
}
