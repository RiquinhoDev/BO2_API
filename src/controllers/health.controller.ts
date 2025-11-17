// =====================================================
// 📁 src/controllers/health.controller.ts
// Health check endpoint com validação de serviços
// =====================================================

import { Request, Response } from 'express'
import mongoose from 'mongoose'
import CronExecutionLog from '../models/CronExecutionLog'

/**
 * GET /api/health
 * Verifica saúde do sistema (MongoDB + CRON jobs)
 */
export const getHealth = async (req: Request, res: Response) => {
  try {
    const checks: any = {
      database: { status: 'unknown' },
      cronJob: { status: 'unknown' }
    }
    
    // Verificar MongoDB
    if (mongoose.connection.readyState === 1) {
      checks.database = { status: 'ok', connected: true }
    } else {
      checks.database = { status: 'error', connected: false }
    }
    
    // Verificar última execução do CRON
    const lastCron = await CronExecutionLog.findOne({ type: 'daily-evaluation' })
      .sort({ startedAt: -1 })
      .limit(1)
    
    if (lastCron) {
      const hoursSinceLastRun = (Date.now() - lastCron.startedAt.getTime()) / (1000 * 60 * 60)
      checks.cronJob = {
        status: hoursSinceLastRun < 48 ? 'ok' : 'warning',
        lastRun: lastCron.startedAt,
        lastStatus: lastCron.status,
        hoursSinceLastRun: Math.round(hoursSinceLastRun * 10) / 10
      }
    } else {
      checks.cronJob = { status: 'warning', message: 'Nenhuma execução registada' }
    }
    
    // Determinar status geral
    const allOk = Object.values(checks).every((check: any) => check.status === 'ok')
    const status = allOk ? 'healthy' : 'degraded'
    
    res.status(allOk ? 200 : 503).json({
      status,
      checks,
      uptime: process.uptime(),
      timestamp: new Date()
    })
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date()
    })
  }
}
