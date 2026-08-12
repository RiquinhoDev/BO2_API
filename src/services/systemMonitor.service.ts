// =====================================================
// 📁 src/services/systemMonitor.service.ts
// Monitorização contínua do sistema
// =====================================================

import logger from '../utils/logger'
import metricsService from './metrics.service'
import notificationService from './notification.service'
import { getRuntimeConfig } from '../config/runtimeConfig'

class SystemMonitor {
  private monitorInterval: NodeJS.Timeout | null = null
  private checkIntervalMs = 60000 // 1 minuto
  private lastAlertTimestamps: Map<string, number> = new Map()
  private alertCooldownMs = 300000 // 5 minutos entre alertas do mesmo tipo

  /**
   * Iniciar monitorização
   */
  start() {
    logger.info('🔍 Iniciando System Monitor...')

    this.monitorInterval = setInterval(() => {
      this.checkSystem()
    }, this.checkIntervalMs)

    // Coletar métricas iniciais
    metricsService.collectMetrics()
  }

  /**
   * Parar monitorização
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval)
      logger.info('⏹️  System Monitor parado')
    }
  }

  /**
   * Verificar se pode enviar alerta (cooldown)
   */
  private canSendAlert(alertType: string): boolean {
    const lastAlert = this.lastAlertTimestamps.get(alertType) || 0
    const now = Date.now()

    if (now - lastAlert > this.alertCooldownMs) {
      this.lastAlertTimestamps.set(alertType, now)
      return true
    }

    return false
  }

  /**
   * Verificar sistema
   */
  private async checkSystem() {
    try {
      const metrics = metricsService.collectMetrics()

      // Verificar memória
      if (metrics.memory.usagePercent > 80) {
        if (this.canSendAlert('high-memory')) {
          await notificationService.alertHighMemoryUsage(metrics.memory.usagePercent)
        }
      }

      // Verificar CPU
      if (metrics.cpu.usage > 90) {
        if (this.canSendAlert('high-cpu')) {
          await notificationService.alertHighCPUUsage(metrics.cpu.usage)
        }
      }

      // Log de métricas (opcional)
      if (getRuntimeConfig().observability.metricsEnabled) {
        logger.info(`📊 Métricas: CPU ${metrics.cpu.usage.toFixed(1)}%, MEM ${metrics.memory.usagePercent.toFixed(1)}%`)
      }
    } catch (error) {
      logger.error('❌ Erro ao verificar sistema:', error)
    }
  }
}

export default new SystemMonitor()
