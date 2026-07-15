// =====================================================
// 📁 src/middleware/metrics.middleware.ts
// Middleware para coleta de métricas de requisições
// =====================================================

import { Request, Response, NextFunction } from 'express'
import { getRequestRouteTemplate } from '../observability/requestRoute'
import logger, { type AppLogger } from '../utils/logger'

interface RequestMetrics {
  method: string
  path: string
  statusCode: number
  responseTime: number
  timestamp: Date
}

class MetricsMiddleware {
  private requestMetrics: RequestMetrics[] = []
  private maxMetricsSize = 1000

  constructor(private readonly log: AppLogger = logger) {}

  /**
   * Middleware para tracking de requisições
   */
  handler = (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now()

    // Hook no finish event da response
    res.on('finish', () => {
      const responseTime = Date.now() - startTime

      const metric: RequestMetrics = {
        method: req.method,
        path: getRequestRouteTemplate(req),
        statusCode: res.statusCode,
        responseTime,
        timestamp: new Date()
      }

      // Guardar métrica
      this.requestMetrics.push(metric)

      // Limitar tamanho do array
      if (this.requestMetrics.length > this.maxMetricsSize) {
        this.requestMetrics.shift()
      }

      // Log de requisições lentas (> 1s)
      if (responseTime > 1000) {
        this.log.warn('Requisição lenta', {
          method: req.method,
          route: metric.path,
          responseTime,
        })
      }
    })

    next()
  }

  /**
   * Obter estatísticas das requisições
   */
  getStats() {
    if (this.requestMetrics.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        slowRequests: 0,
        errorRate: 0
      }
    }

    const totalRequests = this.requestMetrics.length
    const totalResponseTime = this.requestMetrics.reduce((acc, m) => acc + m.responseTime, 0)
    const averageResponseTime = totalResponseTime / totalRequests
    const slowRequests = this.requestMetrics.filter(m => m.responseTime > 1000).length
    const errorRequests = this.requestMetrics.filter(m => m.statusCode >= 400).length
    const errorRate = (errorRequests / totalRequests) * 100

    return {
      totalRequests,
      averageResponseTime: Math.round(averageResponseTime),
      slowRequests,
      errorRate: Math.round(errorRate * 10) / 10
    }
  }

  /**
   * Obter métricas recentes
   */
  getRecent(limit: number = 50): RequestMetrics[] {
    return this.requestMetrics.slice(-limit)
  }
}

const metricsMiddleware = new MetricsMiddleware()

export { metricsMiddleware, MetricsMiddleware }
export default metricsMiddleware.handler
