// ════════════════════════════════════════════════════════════
// 📁 src/controllers/sync.controller.ts
// SYNC CONTROLLER (100% UNIVERSAL SYNC)
// ════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import mongoose from 'mongoose'

// Models
import SyncHistory from '../models/SyncHistory'
import { Product, User, UserProduct } from '../models'

// Services
import { executeDailyPipeline } from '../services/syncUtilziadoresServices/dailyPipeline.service'
import universalSyncService from '../services/syncUtilziadoresServices/universalSyncService'
import hotmartAdapter from '../services/syncUtilziadoresServices/hotmartServices/hotmart.adapter'
import curseducaAdapter from '../services/syncUtilziadoresServices/curseducaServices/curseduca.adapter'

type PipelineStage = mongoose.PipelineStage

// ═══════════════════════════════════════════════════════════
// SECTION 1: PIPELINE & SYNC OPERATIONS
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/sync/execute-pipeline
 * Executar pipeline diário completo
 */
export const executePipeline = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await executeDailyPipeline()
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Pipeline executado com sucesso',
        duration: result.duration,
        summary: result.summary,
        steps: result.steps
      })
    } else {
      res.status(500).json({
        success: false,
        message: 'Pipeline executado com erros',
        duration: result.duration,
        errors: result.errors,
        steps: result.steps
      })
    }
  } catch (error: any) {
    console.error('[API] ❌ Erro ao executar pipeline:', error)
    res.status(500).json({
      success: false,
      message: 'Erro fatal ao executar pipeline',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// HOTMART ENDPOINTS (UNIVERSAL SYNC)
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/sync/hotmart
 * Sincronizar user Hotmart individual via Universal Sync
 */
export const syncHotmartEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, subdomain, name, status, progress, lastAccess, classes } = req.body
    
    if (!email || !subdomain) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: email, subdomain'
      })
      return
    }
    
    // Buscar dados via adapter (filtrar por email)
    const hotmartData = await hotmartAdapter.fetchHotmartDataForSync()
    
    // Filtrar por email
    const userData = hotmartData.find(u => u.email?.toLowerCase() === email.toLowerCase())
    
    if (!userData) {
      res.status(404).json({
        success: false,
        message: 'User não encontrado na API Hotmart'
      })
      return
    }
    
    // Executar Universal Sync
    const result = await universalSyncService.executeUniversalSync({
      syncType: 'hotmart',
      jobName: `Hotmart Sync - ${email}`,
      triggeredBy: 'MANUAL',
      triggeredByUser: (req as any).user?._id?.toString(),
      fullSync: false,
      includeProgress: true,
      includeTags: false,
      batchSize: 1,
      sourceData: [userData]
    })
    
    res.json({
      success: result.success,
      stats: result.stats,
      reportId: result.reportId
    })
  } catch (error: any) {
    console.error('[API] ❌ Erro ao sincronizar Hotmart:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

/**
 * POST /api/sync/hotmart/batch
 * Sincronizar múltiplos users Hotmart via Universal Sync
 */
export const syncHotmartBatchEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subdomain } = req.body
    
    if (!subdomain) {
      res.status(400).json({
        success: false,
        message: 'subdomain is required'
      })
      return
    }
    
    // Buscar TODOS os users via adapter
    const hotmartData = await hotmartAdapter.fetchHotmartDataForSync()
    
    if (hotmartData.length === 0) {
      res.status(200).json({
        success: false,
        message: 'Nenhum user encontrado no Hotmart'
      })
      return
    }
    
    // Executar Universal Sync
    const result = await universalSyncService.executeUniversalSync({
      syncType: 'hotmart',
      jobName: `Hotmart Batch Sync - ${subdomain}`,
      triggeredBy: 'MANUAL',
      triggeredByUser: (req as any).user?._id?.toString(),
      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,
      sourceData: hotmartData
    })
    
    res.json({
      success: result.success,
      stats: result.stats,
      reportId: result.reportId,
      duration: result.duration
    })
  } catch (error: any) {
    console.error('[API] ❌ Erro ao sincronizar Hotmart batch:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// CURSEDUCA ENDPOINTS (UNIVERSAL SYNC)
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/sync/curseduca
 * Sincronizar user CursEduca individual via Universal Sync
 */
export const syncCurseducaEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, groupId } = req.body
    
    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Missing required field: email'
      })
      return
    }
    
    // Buscar dados via adapter
    const curseducaData = await curseducaAdapter.fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: true,
      groupId: groupId as string | undefined,
      enrichWithDetails: true
    })
    
    // Filtrar por email
    const userData = curseducaData.find(u => u.email?.toLowerCase() === email.toLowerCase())
    
    if (!userData) {
      res.status(404).json({
        success: false,
        message: 'User não encontrado na API CursEduca'
      })
      return
    }
    
    // Executar Universal Sync
    const result = await universalSyncService.executeUniversalSync({
      syncType: 'curseduca',
      jobName: `CursEduca Sync - ${email}`,
      triggeredBy: 'MANUAL',
      triggeredByUser: (req as any).user?._id?.toString(),
      fullSync: false,
      includeProgress: true,
      includeTags: false,
      batchSize: 1,
      sourceData: [userData]
    })
    
    res.json({
      success: result.success,
      stats: result.stats,
      reportId: result.reportId
    })
  } catch (error: any) {
    console.error('[API] ❌ Erro ao sincronizar CursEduca:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

/**
 * POST /api/sync/curseduca/batch
 * Sincronizar múltiplos users CursEduca via Universal Sync
 */
export const syncCurseducaBatchEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupId } = req.body
    
    // Buscar TODOS os users via adapter
    const curseducaData = await curseducaAdapter.fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: true,
      groupId: groupId as string | undefined,
      enrichWithDetails: true
    })
    
    if (curseducaData.length === 0) {
      res.status(200).json({
        success: false,
        message: 'Nenhum user encontrado na CursEduca'
      })
      return
    }
    
    // Executar Universal Sync
    const result = await universalSyncService.executeUniversalSync({
      syncType: 'curseduca',
      jobName: `CursEduca Batch Sync${groupId ? ` - Group ${groupId}` : ''}`,
      triggeredBy: 'MANUAL',
      triggeredByUser: (req as any).user?._id?.toString(),
      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,
      sourceData: curseducaData
    })
    
    res.json({
      success: result.success,
      stats: result.stats,
      reportId: result.reportId,
      duration: result.duration
    })
  } catch (error: any) {
    console.error('[API] ❌ Erro ao sincronizar CursEduca batch:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// DISCORD ENDPOINTS (DEPRECADOS - A IMPLEMENTAR)
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/sync/discord
 * ⚠️ A IMPLEMENTAR: Criar discord.adapter.ts primeiro
 */
export const syncDiscordEndpoint = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Discord sync ainda não migrado para Universal Sync',
    note: 'Implementar discord.adapter.ts + usar Universal Sync'
  })
}

/**
 * POST /api/sync/discord/csv
 * ⚠️ A IMPLEMENTAR
 */
export const syncDiscordCSVEndpoint = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Discord CSV sync ainda não migrado para Universal Sync',
    note: 'Implementar adapter para processar CSV → UniversalSourceItem[]'
  })
}

/**
 * POST /api/sync/discord/batch
 * ⚠️ A IMPLEMENTAR
 */
export const syncDiscordBatchEndpoint = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Discord batch sync ainda não migrado para Universal Sync'
  })
}

// ═══════════════════════════════════════════════════════════
// SECTION 2: SYNC HISTORY & STATS (SEM ALTERAÇÕES)
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/sync/history
 * Buscar histórico de sincronizações
 */
export const getSyncHistory = async (req: Request, res: Response): Promise<void> => {
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
    const matchStage: Record<string, any> = {}
    
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

    res.json({
      history,
      count,
      page: +page,
      limit: +limit,
      totalPages: Math.ceil(count / +limit),
      filters: {
        type: type || null,
        status: status || null,
        startDate: startDate || null,
        endDate: endDate || null
      }
    })

  } catch (error: any) {
    console.error("Erro ao buscar histórico:", error)
    res.status(500).json({ 
      message: "Erro ao buscar histórico de sincronizações", 
      details: error.message 
    })
  }
}

/**
 * GET /api/sync/stats
 * Estatísticas de sincronização
 */
export const getSyncStats = async (req: Request, res: Response): Promise<void> => {
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

    res.json({
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
    })

  } catch (error: any) {
    console.error("Erro ao buscar estatísticas:", error)
    res.status(500).json({ 
      message: "Erro ao buscar estatísticas de sincronização", 
      details: error.message 
    })
  }
}

/**
 * DELETE /api/sync/history/clean
 * Limpar histórico antigo
 */
export const cleanOldHistory = async (req: Request, res: Response): Promise<void> => {
  const { days = 90 } = req.query

  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - +days)

    const result = await SyncHistory.deleteMany({
      startedAt: { $lt: cutoffDate },
      status: { $in: ["completed", "failed", "cancelled"] }
    })

    res.json({
      message: `Histórico limpo com sucesso. ${result.deletedCount} registos removidos.`,
      deletedCount: result.deletedCount,
      cutoffDate: cutoffDate.toISOString()
    })

  } catch (error: any) {
    console.error("Erro ao limpar histórico:", error)
    res.status(500).json({ 
      message: "Erro ao limpar histórico", 
      details: error.message 
    })
  }
}

/**
 * POST /api/sync/history/:syncId/retry
 * Retry sincronização falhada
 */
export const retrySyncOperation = async (req: Request, res: Response): Promise<void> => {
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

    res.json({ 
      message: "Sincronização marcada para retry.",
      syncId,
      newStatus: "pending"
    })

  } catch (error: any) {
    console.error("Erro ao fazer retry:", error)
    res.status(500).json({ 
      message: "Erro ao fazer retry da sincronização", 
      details: error.message 
    })
  }
}

/**
 * POST /api/sync/history
 * Criar registo de sincronização
 */
export const createSyncRecord = async (req: Request, res: Response): Promise<void> => {
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

    res.status(201).json({
      message: "Registo de sincronização criado.",
      syncRecord
    })

  } catch (error: any) {
    console.error("Erro ao criar registo:", error)
    res.status(500).json({ 
      message: "Erro ao criar registo de sincronização", 
      details: error.message 
    })
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION 3: SYSTEM STATUS
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/sync/status
 * Verificar status do sistema de sync
 */
export const getSyncStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const totalUsers = await User.countDocuments()
    const totalProducts = await Product.countDocuments()
    const totalUserProducts = await UserProduct.countDocuments()
    
    const productsByPlatform = await Product.aggregate([
      { $group: { _id: '$platform', count: { $sum: 1 } } }
    ])
    
    const userProductsByPlatform = await UserProduct.aggregate([
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      { $group: { _id: '$product.platform', count: { $sum: 1 } } }
    ])
    
    res.json({ 
      success: true, 
      data: {
        users: totalUsers,
        products: totalProducts,
        userProducts: totalUserProducts,
        productsByPlatform,
        userProductsByPlatform
      }
    })
    
  } catch (error: any) {
    console.error('[SYNC STATUS ERROR]', error)
    res.status(500).json({ success: false, error: error.message })
  }
}