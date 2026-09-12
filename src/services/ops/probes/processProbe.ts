// Estado do processo Node. O atraso do event loop esta aqui de proposito: e o
// sinal que aparece antes de a memoria rebentar e o Railway reiniciar o
// container, e por isso vale mais do que a percentagem de CPU.

import os from 'node:os'
import v8 from 'node:v8'
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks'

export interface ProcessUsage {
  readonly rssBytes: number
  readonly heapUsedBytes: number
  readonly heapTotalBytes: number
  readonly heapLimitBytes: number
  readonly externalBytes: number
  readonly systemMemoryUsedBytes: number
  readonly systemMemoryTotalBytes: number
  readonly loadAverage1m: number
  readonly cpuCount: number
  readonly uptimeSeconds: number
  /** Atraso do event loop em ms desde a ultima leitura. */
  readonly eventLoopDelayP50Ms: number
  readonly eventLoopDelayP99Ms: number
}

let histogram: IntervalHistogram | null = null

export function startEventLoopMonitor(): void {
  if (histogram) return
  histogram = monitorEventLoopDelay({ resolution: 20 })
  histogram.enable()
}

export function stopEventLoopMonitor(): void {
  if (!histogram) return
  histogram.disable()
  histogram = null
}

function delayPercentile(percentile: number): number {
  if (!histogram) return 0
  const nanoseconds = histogram.percentile(percentile)
  return Number.isFinite(nanoseconds) ? nanoseconds / 1_000_000 : 0
}

/**
 * Le e reinicia o histograma: cada snapshot descreve a janela desde o anterior,
 * nao a vida inteira do processo. Sem o reset, um pico das 4h da manha
 * continuava a aparecer no p99 da tarde.
 */
export function probeProcess(): ProcessUsage {
  const memory = process.memoryUsage()
  const heap = v8.getHeapStatistics()
  const usage: ProcessUsage = {
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal,
    heapLimitBytes: heap.heap_size_limit,
    externalBytes: memory.external,
    systemMemoryUsedBytes: os.totalmem() - os.freemem(),
    systemMemoryTotalBytes: os.totalmem(),
    loadAverage1m: os.loadavg()[0] ?? 0,
    cpuCount: os.cpus().length,
    uptimeSeconds: process.uptime(),
    eventLoopDelayP50Ms: delayPercentile(50),
    eventLoopDelayP99Ms: delayPercentile(99),
  }
  histogram?.reset()
  return usage
}
