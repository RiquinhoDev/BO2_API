// ════════════════════════════════════════════════════════════
// 📁 src/controllers/syncStats.controller.ts
// Controller: Sync Statistics & Conflict Management
// Endpoints para estatísticas de sync e gestão de conflitos
// ════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import mongoose from 'mongoose'
import SyncHistory from '../../models/SyncModels/SyncHistory'

import { ConflictSeverity, ConflictType, ResolutionAction, ISyncConflict } from '../../models/SyncModels/SyncConflict'
import activitySnapshotService from '../../services/syncUtilizadoresServices/activitySnapshot.service'
import  conflictDetectionService   from '../../services/syncUtilizadoresServices/conflictDetection.service'


// ═══════════════════════════════════════════════════════════
// GET SYNC BY ID
// GET /api/sync/history/:id
// ═══════════════════════════════════════════════════════════

export const getSyncById = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'ID inválido'
      })
      return
    }

    const sync = await SyncHistory.findById(id)
      .populate('triggeredBy.userId', 'name email')
      .populate('triggeredBy.cronJobId', 'name')
      .lean()

    if (!sync) {
      res.status(404).json({
        success: false,
        message: 'Sync não encontrado'
      })
      return
    }

    // Buscar conflitos deste sync
    const conflicts = await conflictDetectionService.getSyncConflicts(
      new mongoose.Types.ObjectId(id)
    )

res.status(200).json({
  success: true,
  message: 'Sync recuperado com sucesso',
  data: {
    sync,
    conflicts: conflicts.map((c: ISyncConflict) => ({
      id: c._id,
      type: c.conflictType,
      severity: c.severity,
      title: c.title,
      status: c.status,
      detectedAt: c.detectedAt
    }))
  }
})

  } catch (error: any) {
    console.error('❌ Erro ao buscar sync:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar sync',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// GET ALL CONFLICTS
// GET /api/sync/conflicts
// ═══════════════════════════════════════════════════════════

export const getConflicts = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      status = 'PENDING',
      severity,
      conflictType,
      email,
      limit = '50'
    } = req.query

    const filters: any = {}

    if (severity) {
      filters.severity = severity as ConflictSeverity
    }

    if (conflictType) {
      filters.conflictType = conflictType as ConflictType
    }

    if (email) {
      filters.email = email as string
    }

    filters.limit = parseInt(limit as string)

    let conflicts

    if (status === 'PENDING') {
      conflicts = await conflictDetectionService.getPendingConflicts(filters)
    } else {
      // Buscar todos com filtros
      const query: any = {}
      
      if (status !== 'ALL') {
        query.status = status
      }
      
      if (filters.severity) query.severity = filters.severity
      if (filters.conflictType) query.conflictType = filters.conflictType
      if (filters.email) query.email = filters.email

      const SyncConflict = (await import('../../models/SyncModels/SyncConflict')).default

      conflicts = await SyncConflict.find(query)
        .sort({ severity: -1, detectedAt: -1 })
        .limit(filters.limit)
        .populate('userId', 'name email')
        .populate('syncHistoryId', 'type startedAt')
        .lean()
    }

    // Estatísticas
    const stats = await conflictDetectionService.getConflictStats()
    const byType = await conflictDetectionService.getConflictsByType()

    res.status(200).json({
      success: true,
      message: 'Conflitos recuperados com sucesso',
      data: {
        total: conflicts.length,
        conflicts,
        stats,
        byType
      }
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar conflitos:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar conflitos',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// GET CONFLICT BY ID
// GET /api/sync/conflicts/:id
// ═══════════════════════════════════════════════════════════

export const getConflictById = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'ID inválido'
      })
      return
    }

    const conflict = await conflictDetectionService.getConflictById(
      new mongoose.Types.ObjectId(id)
    )

    if (!conflict) {
      res.status(404).json({
        success: false,
        message: 'Conflito não encontrado'
      })
      return
    }

    res.status(200).json({
      success: true,
      message: 'Conflito recuperado com sucesso',
      data: { conflict }
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar conflito:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar conflito',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// RESOLVE CONFLICT
// POST /api/sync/conflicts/:id/resolve
// ═══════════════════════════════════════════════════════════

export const resolveConflict = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params
    const { action, notes, appliedChanges } = req.body

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'ID inválido'
      })
      return
    }

    if (!action) {
      res.status(400).json({
        success: false,
        message: 'Campo "action" é obrigatório'
      })
      return
    }

    const validActions: ResolutionAction[] = ['MERGED', 'KEPT_EXISTING', 'USED_NEW', 'MANUAL', 'IGNORED']
    
    if (!validActions.includes(action)) {
      res.status(400).json({
        success: false,
        message: `Ação inválida. Valores aceites: ${validActions.join(', ')}`
      })
      return
    }

    // TODO: Pegar user ID do token JWT
    const adminId = new mongoose.Types.ObjectId('000000000000000000000001')

    const conflict = await conflictDetectionService.resolveConflict({
      conflictId: new mongoose.Types.ObjectId(id),
      action,
      adminId,
      notes,
      appliedChanges
    })

    res.status(200).json({
      success: true,
      message: 'Conflito resolvido com sucesso',
      data: { conflict }
    })

  } catch (error: any) {
    console.error('❌ Erro ao resolver conflito:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao resolver conflito',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// BULK RESOLVE CONFLICTS
// POST /api/sync/conflicts/bulk-resolve
// ═══════════════════════════════════════════════════════════

export const bulkResolveConflicts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { conflictIds, action, notes } = req.body

    if (!conflictIds || !Array.isArray(conflictIds) || conflictIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Campo "conflictIds" deve ser um array não vazio'
      })
      return
    }

    if (!action) {
      res.status(400).json({
        success: false,
        message: 'Campo "action" é obrigatório'
      })
      return
    }

    // Validar IDs
    const invalidIds = conflictIds.filter(id => !mongoose.Types.ObjectId.isValid(id))
    
    if (invalidIds.length > 0) {
      res.status(400).json({
        success: false,
        message: 'IDs inválidos encontrados',
        data: { invalidIds }
      })
      return
    }

    // TODO: Pegar user ID do token JWT
    const adminId = new mongoose.Types.ObjectId('000000000000000000000001')

    const objectIds = conflictIds.map(id => new mongoose.Types.ObjectId(id))

    const resolved = await conflictDetectionService.bulkResolveConflicts(
      objectIds,
      action,
      adminId,
      notes
    )

    res.status(200).json({
      success: true,
      message: `${resolved} conflitos resolvidos com sucesso`,
      data: {
        total: conflictIds.length,
        resolved
      }
    })

  } catch (error: any) {
    console.error('❌ Erro ao resolver conflitos em bulk:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao resolver conflitos',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// AUTO-RESOLVE CONFLICTS
// POST /api/sync/conflicts/auto-resolve
// ═══════════════════════════════════════════════════════════

export const autoResolveConflicts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { conflictIds } = req.body

    if (!conflictIds || !Array.isArray(conflictIds)) {
      res.status(400).json({
        success: false,
        message: 'Campo "conflictIds" deve ser um array'
      })
      return
    }

    // Validar IDs
    const invalidIds = conflictIds.filter(id => !mongoose.Types.ObjectId.isValid(id))
    
    if (invalidIds.length > 0) {
      res.status(400).json({
        success: false,
        message: 'IDs inválidos encontrados',
        data: { invalidIds }
      })
      return
    }

    const objectIds = conflictIds.map(id => new mongoose.Types.ObjectId(id))

    const result = await conflictDetectionService.autoResolveConflicts(objectIds)

    res.status(200).json({
      success: true,
      message: 'Auto-resolução completa',
      data: result
    })

  } catch (error: any) {
    console.error('❌ Erro ao auto-resolver conflitos:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao auto-resolver conflitos',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// IGNORE CONFLICT
// POST /api/sync/conflicts/:id/ignore
// ═══════════════════════════════════════════════════════════

export const ignoreConflict = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params
    const { reason } = req.body

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'ID inválido'
      })
      return
    }

    // TODO: Pegar user ID do token JWT
    const adminId = new mongoose.Types.ObjectId('000000000000000000000001')

    const conflict = await conflictDetectionService.ignoreConflict(
      new mongoose.Types.ObjectId(id),
      adminId,
      reason
    )

    res.status(200).json({
      success: true,
      message: 'Conflito ignorado com sucesso',
      data: { conflict }
    })

  } catch (error: any) {
    console.error('❌ Erro ao ignorar conflito:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao ignorar conflito',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// GET CRITICAL CONFLICTS
// GET /api/sync/conflicts/critical
// ═══════════════════════════════════════════════════════════

export const getCriticalConflicts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = '20' } = req.query

    const conflicts = await conflictDetectionService.getCriticalConflicts(
      parseInt(limit as string)
    )

    res.status(200).json({
      success: true,
      message: 'Conflitos críticos recuperados',
      data: {
        total: conflicts.length,
        conflicts
      }
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar conflitos críticos:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar conflitos críticos',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// GET ACTIVITY SNAPSHOTS STATS
// GET /api/sync/snapshots/stats
// ═══════════════════════════════════════════════════════════

export const getSnapshotStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { month, platform } = req.query

    const targetMonth = month 
      ? new Date(month as string)
      : new Date()

    const stats = await activitySnapshotService.getMonthlyStats(
      targetMonth,
      platform as any
    )

    res.status(200).json({
      success: true,
      message: 'Estatísticas de snapshots recuperadas',
      data: {
        month: targetMonth.toISOString().slice(0, 7),
        platform: platform || 'all',
        stats
      }
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar estatísticas de snapshots:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estatísticas',
      error: error.message
    })
  }
}
