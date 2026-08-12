import { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../contracts/responseContract'
import mongoose from 'mongoose'
import SyncHistory from '../../models/SyncHistory'
import { internalError } from '../../security/errorHandling'
import type { SyncCleanHistoryInput } from '../../security/syncDestructiveInput'

type PipelineStage = mongoose.PipelineStage
/**
 * GET /api/sync/history
 * Buscar histórico de sincronizações
 */
export const getSyncHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { 
    page = 1, 
    limit = 10, 
    type = "", 
    status = "",
    startDate = "",
    endDate = ""
  } = req.query

  const skip = (+page - 1) * +limit

  try {
    const matchStage: {
      type?: string
      status?: string
      startedAt?: { $gte?: Date; $lte?: Date }
    } = {}
    
    if (type && typeof type === "string") {
      matchStage.type = type
    }
    
    if (status && typeof status === "string") {
      matchStage.status = status
    }
    
    if (startDate || endDate) {
      matchStage.startedAt = {}
      if (startDate && typeof startDate === "string") {
        matchStage.startedAt.$gte = new Date(startDate)
      }
      if (endDate && typeof endDate === "string") {
        matchStage.startedAt.$lte = new Date(endDate)
      }
    }

    const pipeline: PipelineStage[] = []
    
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage })
    }
    
    pipeline.push({
      $addFields: {
        successRate: {
          $cond: [
            { $eq: ["$stats.total", 0] },
            0,
            {
              $multiply: [
                { $divide: [
                  { $subtract: ["$stats.total", "$stats.errors"] },
                  "$stats.total"
                ]},
                100
              ]
            }
          ]
        }
      }
    })
    
    pipeline.push({ $sort: { startedAt: -1 } })
    pipeline.push({ $skip: skip })
    pipeline.push({ $limit: +limit })

    const history = await SyncHistory.aggregate(pipeline)
    
    const countPipeline: PipelineStage[] = []
    if (Object.keys(matchStage).length > 0) {
      countPipeline.push({ $match: matchStage })
    }
    countPipeline.push({ $count: "total" })
    
    const countResult = await SyncHistory.aggregate(countPipeline)
    const count = countResult[0]?.total || 0

    res.json(successResponse(
      { history },
      { count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit), filters: { type: type || null, status: status || null, startDate: startDate || null, endDate: endDate || null } },
    ))

  } catch (error: unknown) {
    next(internalError(
      "Erro ao buscar histórico de sincronizações",
      'SYNC_HISTORY_LIST_FAILED',
      error,
    ))
  }
}

/**
 * GET /api/sync/stats
 * Estatísticas de sincronização
 */
export const getSyncStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const totalSyncs = await SyncHistory.countDocuments()
    const completedSyncs = await SyncHistory.countDocuments({ status: "completed" })
    const failedSyncs = await SyncHistory.countDocuments({ status: "failed" })
    const runningSyncs = await SyncHistory.countDocuments({ status: "running" })

    const recentSyncs = await SyncHistory.find()
      .sort({ startedAt: -1 })
      .limit(7)
      .select('type status startedAt stats duration')

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const typeStats = await SyncHistory.aggregate([
      {
        $match: {
          startedAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          totalRecords: { $sum: "$stats.total" },
          totalAdded: { $sum: "$stats.added" },
          totalUpdated: { $sum: "$stats.updated" },
          totalErrors: { $sum: "$stats.errors" },
          avgDuration: { $avg: "$duration" },
          lastSync: { $max: "$startedAt" }
        }
      }
    ])

    const performanceStats = await SyncHistory.aggregate([
      {
        $match: {
          startedAt: { $gte: thirtyDaysAgo },
          status: "completed"
        }
      },
      {
        $group: {
          _id: null,
          avgDuration: { $avg: "$duration" },
          avgRecordsPerSync: { $avg: "$stats.total" },
          avgSuccessRate: { 
            $avg: {
              $cond: [
                { $eq: ["$stats.total", 0] },
                100,
                {
                  $multiply: [
                    { $divide: [
                      { $subtract: ["$stats.total", "$stats.errors"] },
                      "$stats.total"
                    ]},
                    100
                  ]
                }
              ]
            }
          }
        }
      }
    ])

    const performance = performanceStats[0] || {
      avgDuration: 0,
      avgRecordsPerSync: 0,
      avgSuccessRate: 0
    }

    res.json(successResponse({
      overview: {
        totalSyncs,
        completedSyncs,
        failedSyncs,
        runningSyncs,
        successRate: totalSyncs > 0 ? Math.round((completedSyncs / totalSyncs) * 100) : 0
      },
      recentSyncs,
      typeStats,
      performance: {
        avgDuration: Math.round(performance.avgDuration || 0),
        avgRecordsPerSync: Math.round(performance.avgRecordsPerSync || 0),
        avgSuccessRate: Math.round(performance.avgSuccessRate || 0)
      }
    }))

  } catch (error: unknown) {
    next(internalError(
      "Erro ao buscar estatísticas de sincronização",
      'SYNC_STATS_READ_FAILED',
      error,
    ))
  }
}

/**
 * DELETE /api/sync/history/clean
 * Limpar histórico antigo
 */
export const cleanOldHistory = async (
  input: SyncCleanHistoryInput,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { days = 90 } = input.query

  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - +days)

    const result = await SyncHistory.deleteMany({
      startedAt: { $lt: cutoffDate },
      status: { $in: ["completed", "failed", "cancelled"] }
    })

    res.json(successResponse({ deletedCount: result.deletedCount, cutoffDate: cutoffDate.toISOString() },
      { message: `Histórico limpo com sucesso. ${result.deletedCount} registos removidos.` }))

  } catch (error: unknown) {
    next(internalError('Erro ao limpar histórico', 'SYNC_HISTORY_CLEAN_FAILED', error))
  }
}

/**
 * POST /api/sync/history/:syncId/retry
 * Retry sincronização falhada
 */
export const retrySyncOperation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { syncId } = req.params

  try {
    const syncRecord = await SyncHistory.findById(syncId)

    if (!syncRecord) {
      res.status(404).json({ message: "Registo de sincronização não encontrado." })
      return
    }

    if (syncRecord.status !== "failed") {
      res.status(400).json({ message: "Apenas sincronizações falhadas podem ser repetidas." })
      return
    }

    await SyncHistory.findByIdAndUpdate(syncId, {
      status: "pending",
      completedAt: undefined,
      errorDetails: [],
      stats: {
        total: 0,
        added: 0,
        updated: 0,
        conflicts: 0,
        errors: 0
      }
    })

    res.json(successResponse({ syncId, newStatus: "pending" },
      { message: "Sincronização marcada para retry." }))

  } catch (error: unknown) {
    next(internalError(
      "Erro ao fazer retry da sincronização",
      'SYNC_HISTORY_RETRY_FAILED',
      error,
    ))
  }
}

/**
 * POST /api/sync/history
 * Criar registo de sincronização
 */
export const createSyncRecord = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { type, user, metadata } = req.body

  if (!type || !["hotmart", "curseduca", "discord", "csv"].includes(type)) {
    res.status(400).json({ message: "Tipo de sincronização inválido." })
    return
  }

  try {
    const syncRecord = new SyncHistory({
      type,
      user,
      metadata,
      status: "pending"
    })

    await syncRecord.save()

    res.status(201).json(successResponse({ syncRecord },
      { message: "Registo de sincronização criado." }))

  } catch (error: unknown) {
    next(internalError(
      "Erro ao criar registo de sincronização",
      'SYNC_HISTORY_CREATE_FAILED',
      error,
    ))
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION 3: SYSTEM STATUS
// ═══════════════════════════════════════════════════════════
