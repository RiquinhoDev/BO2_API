// src/controllers/sync.controller.ts
import { Request, Response } from "express"
import SyncHistory from "../models/SyncHistory"
import mongoose from "mongoose"

type PipelineStage = mongoose.PipelineStage

// 📋 BUSCAR HISTÓRICO DE SINCRONIZAÇÕES
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
    // Filtros dinâmicos
    const matchStage: Record<string, any> = {}
    
    if (type && typeof type === "string") {
      matchStage.type = type
    }
    
    if (status && typeof status === "string") {
      matchStage.status = status
    }
    
    // Filtro por data
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
    
    // Adicionar campos calculados
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
    
    // Contar total
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

// 📊 ESTATÍSTICAS DE SINCRONIZAÇÃO
export const getSyncStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // Estatísticas gerais
    const totalSyncs = await SyncHistory.countDocuments()
    const completedSyncs = await SyncHistory.countDocuments({ status: "completed" })
    const failedSyncs = await SyncHistory.countDocuments({ status: "failed" })
    const runningSyncs = await SyncHistory.countDocuments({ status: "running" })

    // Últimas 7 sincronizações
    const recentSyncs = await SyncHistory.find()
      .sort({ startedAt: -1 })
      .limit(7)
      .select('type status startedAt stats duration')

    // Estatísticas por tipo (últimos 30 dias)
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

    // Performance média (últimos 30 dias)
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

// 🗑️ LIMPAR HISTÓRICO ANTIGO
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

// 🔄 RETRY SINCRONIZAÇÃO FALHADA
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

    // Resetar para retry
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

// 📝 CRIAR REGISTO DE SINCRONIZAÇÃO
export const createSyncRecord = async (req: Request, res: Response): Promise<void> => {
  const { type, user, metadata } = req.body

  if (!type || !["hotmart", "csv"].includes(type)) {
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