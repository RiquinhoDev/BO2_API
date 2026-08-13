import { errorMessage } from './universalSync/fieldUtils'
import logger from '../../utils/logger'
// ════════════════════════════════════════════════════════════
// 📁 syncReports.service.ts - VERSÃO CORRIGIDA
// ════════════════════════════════════════════════════════════

import SyncReport, { 
  ISyncReport, 
  SyncType, 
  TriggerType,
  ISyncReportStats,
  ISyncReportSnapshot,
  ISyncReportConfig 
} from '../../models/SyncModels/SyncReport'
import { Types } from 'mongoose'
import User from '../../models/user'
import { getRuntimeConfig } from '../../config/runtimeConfig'

export const createSnapshot = async (): Promise<ISyncReportSnapshot> => {
  try {
    const totalUsers = await User.countDocuments()
    const activeUsers = await User.countDocuments({ isActive: true })
    const hotmartCount = await User.countDocuments({ 
      'hotmart.hotmartUserId': { $exists: true, $ne: null } 
    })
    const curseducaCount = await User.countDocuments({ 
      'curseduca.curseducaUserId': { $exists: true, $ne: null } 
    })
    const discordCount = await User.countDocuments({ 
      'discord.discordUserId': { $exists: true, $ne: null } 
    })
    
    return {
      timestamp: new Date(),
      totalUsers,
      activeUsers,
      platformStats: {
        hotmart: hotmartCount,
        curseduca: curseducaCount,
        discord: discordCount
      }
    }
  } catch (error: unknown) {
    logger.error('❌ Erro ao criar snapshot:', error)
    return {
      timestamp: new Date(),
      totalUsers: 0,
      activeUsers: 0,
      platformStats: {},
      hasError: true,
      errorMessage: errorMessage(error)
    } as ISyncReportSnapshot
  }
}

export interface CreateReportOptions {
  jobId?: string
  jobName: string
  syncType: SyncType
  triggeredBy: TriggerType
  triggeredByUser?: string
  syncConfig: ISyncReportConfig
}

export const createSyncReport = async (
  options: CreateReportOptions
): Promise<ISyncReport> => {
  logger.info('📝 [SyncReports] Criando novo report:', options.jobName)
  
  try {
    const beforeSnapshot = await createSnapshot()
    
    let jobIdObj: Types.ObjectId | undefined = undefined
    if (options.jobId) {
      if (Types.ObjectId.isValid(options.jobId)) {
        jobIdObj = new Types.ObjectId(options.jobId)
      } else {
        logger.warn(`⚠️ [SyncReports] jobId inválido (ignorado): ${options.jobId}`)
      }
    }
    
    let triggeredByUserObj: Types.ObjectId | undefined = undefined
    if (options.triggeredByUser) {
      if (Types.ObjectId.isValid(options.triggeredByUser)) {
        triggeredByUserObj = new Types.ObjectId(options.triggeredByUser)
      } else {
        logger.warn(`⚠️ [SyncReports] triggeredByUser inválido (ignorado): ${options.triggeredByUser}`)
      }
    }
    
    const report = await SyncReport.create({
      jobId: jobIdObj,
      jobName: options.jobName,
      syncType: options.syncType,
      triggeredBy: options.triggeredBy,
      triggeredByUser: triggeredByUserObj,
      status: 'running',
      startedAt: new Date(),
      stats: {
        total: 0,
        inserted: 0,
        updated: 0,
        errors: 0,
        skipped: 0,
        unchanged: 0
      },
      errors: [],
      warnings: [],
      conflicts: [],
      logs: [],
      snapshots: {
        before: beforeSnapshot
      },
      syncConfig: options.syncConfig,
      metadata: {
        environment: getRuntimeConfig().core.nodeEnv,
        apiVersion: '3.0',
        serverVersion: getRuntimeConfig().core.serverVersion
      }
    })
    
    logger.info(`✅ [SyncReports] Report criado: ${report._id}`)
    return report
    
  } catch (error: unknown) {
    logger.error('❌ [SyncReports] Erro ao criar report:', error)
    throw new Error(`Falha ao criar report: ${errorMessage(error)}`)
  }
}

export const updateReportStats = async (
  reportId: string,
  stats: Partial<ISyncReportStats>
): Promise<ISyncReport | null> => {
  try {
    const report = await SyncReport.findById(reportId)
    if (!report) {
      logger.error(`❌ [SyncReports] Report não encontrado: ${reportId}`)
      return null
    }
    Object.assign(report.stats, stats)
    await report.save()
    return report
  } catch (error: unknown) {
    logger.error('❌ [SyncReports] Erro ao atualizar stats:', error)
    return null
  }
}

export const completeReport = async (
  reportId: string,
  status: 'success' | 'failed' | 'partial'
): Promise<ISyncReport | null> => {
  logger.info(`🏁 [SyncReports] Finalizando report ${reportId} com status: ${status}`)
  
  try {
    const report = await SyncReport.findById(reportId)
    if (!report) {
      logger.error(`❌ [SyncReports] Report não encontrado: ${reportId}`)
      return null
    }
    
    await report.addLog('info', `Finalizando sync com status: ${status}`, {
      totalProcessed: report.stats.total,
      errors: report.stats.errors
    })
    
    const afterSnapshot = await createSnapshot()
    report.snapshots.after = afterSnapshot
    await report.markAsComplete(status)
    
    logger.info(`✅ [SyncReports] Report finalizado: ${reportId}`)
    logger.info(`   📊 Stats: ${report.stats.total} processados, ${report.stats.errors} erros`)
    logger.info(`   ⏱️ Duração: ${report.duration}s`)
    logger.info(`   ✅ Success rate: ${report.getSuccessRate()}%`)
    return report
    
  } catch (error: unknown) {
    logger.error('❌ [SyncReports] Erro ao finalizar report:', error)
    return null
  }
}

export const addReportError = async (
  reportId: string,
  message: string,
  userId?: string,
  userEmail?: string,
  stack?: string
): Promise<void> => {
  try {
    const report = await SyncReport.findById(reportId)
    if (!report) {
      logger.warn(`⚠️ [SyncReports] Report não encontrado ao adicionar erro: ${reportId}`)
      return
    }
    await report.addError({ message, userId, userEmail, stack })
  } catch (error: unknown) {
    logger.error('❌ [SyncReports] Erro ao adicionar erro ao report:', error)
  }
}

export const addReportWarning = async (
  reportId: string,
  message: string,
  userId?: string,
  context?: string
): Promise<void> => {
  try {
    const report = await SyncReport.findById(reportId)
    if (!report) {
      logger.warn(`⚠️ [SyncReports] Report não encontrado ao adicionar warning: ${reportId}`)
      return
    }
    await report.addWarning({ message, userId, context })
  } catch (error: unknown) {
    logger.error('❌ [SyncReports] Erro ao adicionar warning ao report:', error)
  }
}

export const addReportLog = async (
  reportId: string,
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  meta?: unknown
): Promise<void> => {
  try {
    const report = await SyncReport.findById(reportId)
    if (!report) {
      logger.warn(`⚠️ [SyncReports] Report não encontrado ao adicionar log: ${reportId}`)
      return
    }
    await report.addLog(level, message, meta)
  } catch (error: unknown) {
    logger.error('❌ [SyncReports] Erro ao adicionar log ao report:', error)
  }
}

export const getReports = async (
  limit: number = 20,
  syncType?: SyncType
): Promise<ISyncReport[]> => {
  try {
    const query = syncType ? { syncType } : {}
    return await SyncReport.find(query)
      .sort({ startedAt: -1 })
      .limit(limit)
      .populate('jobId', 'name syncType schedule')
      .populate('triggeredByUser', 'name email')
      .lean()
  } catch (error: unknown) {
    logger.error('❌ [SyncReports] Erro ao buscar reports:', error)
    return []
  }
}

export const getReportById = async (
  reportId: string
): Promise<ISyncReport | null> => {
  try {
    return await SyncReport.findById(reportId)
      .populate('jobId', 'name syncType schedule')
      .populate('triggeredByUser', 'name email')
      .lean()
  } catch (error: unknown) {
    logger.error('❌ [SyncReports] Erro ao buscar report:', error)
    return null
  }
}

export const getReportsByJob = async (
  jobId: string,
  limit: number = 20
): Promise<ISyncReport[]> => {
  try {
    return await SyncReport.findByJob(jobId, limit)
  } catch (error: unknown) {
    logger.error('❌ [SyncReports] Erro ao buscar reports do job:', error)
    return []
  }
}

export const getAggregatedStats = async (days: number = 30) => {
  try {
    return await SyncReport.getAggregatedStats(days)
  } catch (error: unknown) {
    logger.error('❌ [SyncReports] Erro ao buscar stats agregados:', error)
    return {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      avgDuration: 0,
      totalProcessed: 0,
      totalErrors: 0
    }
  }
}

export default {
  createSyncReport,
  updateReportStats,
  completeReport,
  addReportError,
  addReportWarning,
  addReportLog,
  getReports,
  getReportById,
  getReportsByJob,
  getAggregatedStats,
  createSnapshot
}