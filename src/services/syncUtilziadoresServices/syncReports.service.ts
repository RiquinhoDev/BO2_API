// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilizadoresServices/syncReports.service.ts
// Service: Sync Reports Management
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

// ═══════════════════════════════════════════════════════════
// HELPER: CREATE SNAPSHOT
// ═══════════════════════════════════════════════════════════

export const createSnapshot = async (): Promise<ISyncReportSnapshot> => {
  try {
    const totalUsers = await User.countDocuments()
    const activeUsers = await User.countDocuments({ isActive: true })
    
    const hotmartCount = await User.countDocuments({ 
      'platforms.hotmart.hotmartUserId': { $exists: true, $ne: null } 
    })
    
    const curseducaCount = await User.countDocuments({ 
      'platforms.curseduca.curseducaUserId': { $exists: true, $ne: null } 
    })
    
    const discordCount = await User.countDocuments({ 
      'platforms.discord.discordUserId': { $exists: true, $ne: null } 
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
  } catch (error) {
    console.error('❌ Erro ao criar snapshot:', error)
    return {
      timestamp: new Date(),
      totalUsers: 0,
      activeUsers: 0,
      platformStats: {}
    }
  }
}

// ═══════════════════════════════════════════════════════════
// CREATE REPORT
// ═══════════════════════════════════════════════════════════

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
  console.log('📝 [SyncReports] Criando novo report:', options.jobName)
  
  try {
    // Criar snapshot inicial
    const beforeSnapshot = await createSnapshot()
    
    const report = await SyncReport.create({
      jobId: options.jobId ? new Types.ObjectId(options.jobId) : undefined,
      jobName: options.jobName,
      syncType: options.syncType,
      triggeredBy: options.triggeredBy,
      triggeredByUser: options.triggeredByUser 
        ? new Types.ObjectId(options.triggeredByUser) 
        : undefined,
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
        environment: process.env.NODE_ENV || 'development',
        apiVersion: '2.0',
        serverVersion: process.env.npm_package_version
      }
    })
    
    console.log(`✅ [SyncReports] Report criado: ${report._id}`)
    return report
    
  } catch (error: any) {
    console.error('❌ [SyncReports] Erro ao criar report:', error)
    throw new Error(`Falha ao criar report: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════
// UPDATE REPORT STATS
// ═══════════════════════════════════════════════════════════

export const updateReportStats = async (
  reportId: string,
  stats: Partial<ISyncReportStats>
): Promise<ISyncReport | null> => {
  try {
    const report = await SyncReport.findById(reportId)
    if (!report) {
      console.error(`❌ [SyncReports] Report não encontrado: ${reportId}`)
      return null
    }
    
    // Atualizar stats
    Object.assign(report.stats, stats)
    
    await report.save()
    return report
    
  } catch (error: any) {
    console.error('❌ [SyncReports] Erro ao atualizar stats:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════
// COMPLETE REPORT
// ═══════════════════════════════════════════════════════════

export const completeReport = async (
  reportId: string,
  status: 'success' | 'failed' | 'partial'
): Promise<ISyncReport | null> => {
  console.log(`🏁 [SyncReports] Finalizando report ${reportId} com status: ${status}`)
  
  try {
    const report = await SyncReport.findById(reportId)
    if (!report) {
      console.error(`❌ [SyncReports] Report não encontrado: ${reportId}`)
      return null
    }
    
    // Criar snapshot final
    const afterSnapshot = await createSnapshot()
    report.snapshots.after = afterSnapshot
    
    // Marcar como completo
    await report.markAsComplete(status)
    
    // Log final
    await report.addLog('info', `Sync finalizado com status: ${status}`, {
      duration: report.duration,
      totalProcessed: report.stats.total,
      successRate: report.getSuccessRate()
    })
    
    console.log(`✅ [SyncReports] Report finalizado: ${reportId}`)
    console.log(`   📊 Stats: ${report.stats.total} processados, ${report.stats.errors} erros`)
    console.log(`   ⏱️ Duração: ${report.duration}s`)
    
    return report
    
  } catch (error: any) {
    console.error('❌ [SyncReports] Erro ao finalizar report:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════
// ADD ERROR TO REPORT
// ═══════════════════════════════════════════════════════════

export const addReportError = async (
  reportId: string,
  message: string,
  userId?: string,
  userEmail?: string,
  stack?: string
): Promise<void> => {
  try {
    const report = await SyncReport.findById(reportId)
    if (!report) return
    
    await report.addError({
      message,
      userId,
      userEmail,
      stack
    })
    
  } catch (error: any) {
    console.error('❌ [SyncReports] Erro ao adicionar erro ao report:', error)
  }
}

// ═══════════════════════════════════════════════════════════
// ADD WARNING TO REPORT
// ═══════════════════════════════════════════════════════════

export const addReportWarning = async (
  reportId: string,
  message: string,
  userId?: string,
  context?: string
): Promise<void> => {
  try {
    const report = await SyncReport.findById(reportId)
    if (!report) return
    
    await report.addWarning({
      message,
      userId,
      context
    })
    
  } catch (error: any) {
    console.error('❌ [SyncReports] Erro ao adicionar warning ao report:', error)
  }
}

// ═══════════════════════════════════════════════════════════
// ADD LOG TO REPORT
// ═══════════════════════════════════════════════════════════

export const addReportLog = async (
  reportId: string,
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  meta?: any
): Promise<void> => {
  try {
    const report = await SyncReport.findById(reportId)
    if (!report) return
    
    await report.addLog(level, message, meta)
    
  } catch (error: any) {
    console.error('❌ [SyncReports] Erro ao adicionar log ao report:', error)
  }
}

// ═══════════════════════════════════════════════════════════
// GET REPORTS
// ═══════════════════════════════════════════════════════════

export const getReports = async (
  limit: number = 20,
  syncType?: SyncType
): Promise<ISyncReport[]> => {
  try {
    const query = syncType ? { syncType } : {}
    
    const reports = await SyncReport.find(query)
      .sort({ startedAt: -1 })
      .limit(limit)
      .populate('jobId', 'name syncType schedule')
      .populate('triggeredByUser', 'name email')
      .lean()
    
    return reports
    
  } catch (error: any) {
    console.error('❌ [SyncReports] Erro ao buscar reports:', error)
    return []
  }
}

// ═══════════════════════════════════════════════════════════
// GET REPORT BY ID
// ═══════════════════════════════════════════════════════════

export const getReportById = async (
  reportId: string
): Promise<ISyncReport | null> => {
  try {
    const report = await SyncReport.findById(reportId)
      .populate('jobId', 'name syncType schedule')
      .populate('triggeredByUser', 'name email')
      .lean()
    
    return report
    
  } catch (error: any) {
    console.error('❌ [SyncReports] Erro ao buscar report:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════
// GET REPORTS BY JOB
// ═══════════════════════════════════════════════════════════

export const getReportsByJob = async (
  jobId: string,
  limit: number = 20
): Promise<ISyncReport[]> => {
  try {
    const reports = await SyncReport.findByJob(jobId, limit)
    return reports
    
  } catch (error: any) {
    console.error('❌ [SyncReports] Erro ao buscar reports do job:', error)
    return []
  }
}

// ═══════════════════════════════════════════════════════════
// GET AGGREGATED STATS
// ═══════════════════════════════════════════════════════════

export const getAggregatedStats = async (days: number = 30) => {
  try {
    const stats = await SyncReport.getAggregatedStats(days)
    return stats
    
  } catch (error: any) {
    console.error('❌ [SyncReports] Erro ao buscar stats agregados:', error)
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

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

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