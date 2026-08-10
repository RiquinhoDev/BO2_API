import type { Request, Response } from 'express'
import mongoose from 'mongoose'
import type { ConflictSeverity, ConflictType, ResolutionAction } from '../../models/SyncModels/SyncConflict'
import conflictDetectionService from '../../services/syncUtilizadoresServices/conflictDetection.service'

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
