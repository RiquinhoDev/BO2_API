// =====================================================
// 📁 src/controllers/metrics.controller.ts
// Controller para endpoints de métricas
// =====================================================

import { type NextFunction, Request, Response } from 'express'
import metricsService from '../services/metrics.service'
import CronExecutionLog from '../models/cron/CronExecutionLog'
import { forwardApplicationError } from '../security/forwardApplicationError'
import { successResponse } from '../contracts/responseContract'

/**
 * GET /api/metrics
 * Retorna métricas do sistema
 */
export const getMetrics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentMetrics = metricsService.collectMetrics()
    const stats = metricsService.getStats()

    res.json(successResponse(currentMetrics, { stats, timestamp: new Date() }))
  } catch (error: unknown) {
    forwardApplicationError(next, error, 'Erro ao obter métricas', 'METRICS_READ_FAILED')
  }
}

/**
 * GET /api/metrics/history
 * Retorna histórico de métricas
 */
export const getMetricsHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const history = metricsService.getHistory()

    res.json(successResponse(history, { count: history.length }))
  } catch (error: unknown) {
    forwardApplicationError(next, error, 'Erro ao obter histórico de métricas', 'METRICS_HISTORY_READ_FAILED')
  }
}

/**
 * GET /api/metrics/cron
 * Retorna métricas dos CRON jobs
 */
export const getCronMetrics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const logs = await CronExecutionLog.find({
      startedAt: { $gte: last24h }
    }).sort({ startedAt: -1 })

    const totalExecutions = logs.length
    const successfulExecutions = logs.filter(l => l.status === 'success').length
    const failedExecutions = logs.filter(l => l.status === 'failed').length
    const averageDuration = logs.reduce((acc, l) => acc + (l.duration || 0), 0) / totalExecutions || 0

    res.json(successResponse({
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0,
        averageDuration: Math.round(averageDuration),
        last24Hours: logs.slice(0, 10)
      }))
  } catch (error: unknown) {
    forwardApplicationError(next, error, 'Erro ao obter métricas dos CRON jobs', 'CRON_METRICS_READ_FAILED')
  }
}
