// =====================================================
// 📁 src/services/metrics.service.ts
// Serviço de coleta de métricas do sistema
// =====================================================

import os from 'os'
import v8 from 'v8'

interface SystemMetrics {
  cpu: {
    usage: number
    loadAverage: number[]
  }
  memory: {
    used: number
    total: number
    usagePercent: number
    heapUsed: number
    heapTotal: number
  }
  uptime: {
    process: number
    system: number
  }
  timestamp: Date
}

class MetricsService {
  private metricsHistory: SystemMetrics[] = []
  private maxHistorySize = 100

  /**
   * Coletar métricas do sistema
   */
  collectMetrics(): SystemMetrics {
    const cpus = os.cpus()
    const totalMemory = os.totalmem()
    const freeMemory = os.freemem()
    const usedMemory = totalMemory - freeMemory
    
    const heapStats = v8.getHeapStatistics()

    const metrics: SystemMetrics = {
      cpu: {
        usage: this.calculateCPUUsage(cpus),
        loadAverage: os.loadavg()
      },
      memory: {
        used: usedMemory,
        total: totalMemory,
        usagePercent: (usedMemory / totalMemory) * 100,
        heapUsed: heapStats.used_heap_size,
        heapTotal: heapStats.total_heap_size
      },
      uptime: {
        process: process.uptime(),
        system: os.uptime()
      },
      timestamp: new Date()
    }

    // Guardar no histórico
    this.metricsHistory.push(metrics)
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift()
    }

    return metrics
  }

  /**
   * Calcular uso da CPU
   */
  private calculateCPUUsage(cpus: os.CpuInfo[]): number {
    let totalIdle = 0
    let totalTick = 0

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof os.CpuInfo['times']]
      }
      totalIdle += cpu.times.idle
    })

    const idle = totalIdle / cpus.length
    const total = totalTick / cpus.length
    const usage = 100 - ~~(100 * idle / total)

    return usage
  }

  /**
   * Obter histórico de métricas
   */
  getHistory(): SystemMetrics[] {
    return this.metricsHistory
  }

  /**
   * Obter estatísticas agregadas
   */
  getStats() {
    if (this.metricsHistory.length === 0) {
      return null
    }

    const cpuUsages = this.metricsHistory.map(m => m.cpu.usage)
    const memUsages = this.metricsHistory.map(m => m.memory.usagePercent)

    return {
      cpu: {
        avg: cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length,
        min: Math.min(...cpuUsages),
        max: Math.max(...cpuUsages),
        current: cpuUsages[cpuUsages.length - 1]
      },
      memory: {
        avg: memUsages.reduce((a, b) => a + b, 0) / memUsages.length,
        min: Math.min(...memUsages),
        max: Math.max(...memUsages),
        current: memUsages[memUsages.length - 1]
      },
      historySize: this.metricsHistory.length
    }
  }
}

export default new MetricsService()

