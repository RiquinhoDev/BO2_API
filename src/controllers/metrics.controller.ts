// =====================================================
// 📁 src/controllers/metrics.controller.ts
// Controller para endpoints de métricas
// =====================================================

import { Request, Response } from 'express'
import metricsService from '../services/metrics.service'
import CronExecutionLog from '../models/CronExecutionLog'

/**
 * GET /api/metrics
 * Retorna métricas do sistema
 */
export const getMetrics = async (req: Request, res: Response) => {
  try {
    const currentMetrics = metricsService.collectMetrics()
    const stats = metricsService.getStats()

    res.json({
      success: true,
      current: currentMetrics,
      stats,
      timestamp: new Date()
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * GET /api/metrics/history
 * Retorna histórico de métricas
 */
export const getMetricsHistory = async (req: Request, res: Response) => {
  try {
    const history = metricsService.getHistory()

    res.json({
      success: true,
      history,
      count: history.length
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * GET /api/metrics/cron
 * Retorna métricas dos CRON jobs
 */
export const getCronMetrics = async (req: Request, res: Response) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const logs = await CronExecutionLog.find({
      startedAt: { $gte: last24h }
    }).sort({ startedAt: -1 })

    const totalExecutions = logs.length
    const successfulExecutions = logs.filter(l => l.status === 'success').length
    const failedExecutions = logs.filter(l => l.status === 'failed').length
    const averageDuration = logs.reduce((acc, l) => acc + (l.duration || 0), 0) / totalExecutions || 0

    res.json({
      success: true,
      metrics: {
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0,
        averageDuration: Math.round(averageDuration),
        last24Hours: logs.slice(0, 10)
      }
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
