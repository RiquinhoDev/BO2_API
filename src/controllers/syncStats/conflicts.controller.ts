import type { NextFunction, Request, Response } from 'express'
import mongoose from 'mongoose'
import type {
  ConflictSeverity,
  ConflictStatus,
  ConflictType,
  ISyncConflict,
  ResolutionAction,
} from '../../models/SyncModels/SyncConflict'
import conflictDetectionService from '../../services/syncUtilizadoresServices/conflictDetection.service'
import { internalError } from '../../security/errorHandling'
import { successResponse } from '../../contracts/responseContract'

type ConflictListQuery = {
  status?: ConflictStatus | 'ALL'
  severity?: ConflictSeverity
  conflictType?: ConflictType
  email?: string
  limit?: string
}

type ConflictFilters = {
  severity?: ConflictSeverity
  conflictType?: ConflictType
  email?: string
  limit: number
}

export const getConflicts = async (
  req: Request<Record<string, never>, unknown, unknown, ConflictListQuery>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      status = 'PENDING',
      severity,
      conflictType,
      email,
      limit = '50'
    } = req.query

    const filters: ConflictFilters = {
      limit: parseInt(limit, 10),
    }

    if (severity) filters.severity = severity
    if (conflictType) filters.conflictType = conflictType
    if (email) filters.email = email

    let conflicts

    if (status === 'PENDING') {
      conflicts = await conflictDetectionService.getPendingConflicts(filters)
    } else {
      const query: mongoose.FilterQuery<ISyncConflict> = {}

      if (status !== 'ALL') query.status = status
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

    const stats = await conflictDetectionService.getConflictStats()
    const byType = await conflictDetectionService.getConflictsByType()

    res.status(200).json(successResponse({
      total: conflicts.length,
      conflicts,
      stats,
      byType
    }, { message: 'Conflitos recuperados com sucesso' }))
  } catch (error: unknown) {
    next(internalError('Erro ao buscar conflitos', 'SYNC_CONFLICT_LIST_FAILED', error))
  }
}

export const getConflictById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
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

    res.status(200).json(successResponse({ conflict }, { message: 'Conflito recuperado com sucesso' }))
  } catch (error: unknown) {
    next(internalError('Erro ao buscar conflito', 'SYNC_CONFLICT_READ_FAILED', error))
  }
}

export const resolveConflict = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
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

    const adminId = new mongoose.Types.ObjectId('000000000000000000000001')

    const conflict = await conflictDetectionService.resolveConflict({
      conflictId: new mongoose.Types.ObjectId(id),
      action,
      adminId,
      notes,
      appliedChanges
    })

    res.status(200).json(successResponse({ conflict }, { message: 'Conflito resolvido com sucesso' }))
  } catch (error: unknown) {
    next(internalError('Erro ao resolver conflito', 'SYNC_CONFLICT_RESOLVE_FAILED', error))
  }
}

export const bulkResolveConflicts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    const invalidIds = conflictIds.filter(id => !mongoose.Types.ObjectId.isValid(id))

    if (invalidIds.length > 0) {
      res.status(400).json({
        success: false,
        message: 'IDs inválidos encontrados',
        data: { invalidIds }
      })
      return
    }

    const adminId = new mongoose.Types.ObjectId('000000000000000000000001')
    const objectIds = conflictIds.map(id => new mongoose.Types.ObjectId(id))

    const resolved = await conflictDetectionService.bulkResolveConflicts(
      objectIds,
      action,
      adminId,
      notes
    )

    res.status(200).json(successResponse({
      total: conflictIds.length,
      resolved
    }, { message: `${resolved} conflitos resolvidos com sucesso` }))
  } catch (error: unknown) {
    next(internalError(
      'Erro ao resolver conflitos',
      'SYNC_CONFLICT_BULK_RESOLVE_FAILED',
      error,
    ))
  }
}

export const autoResolveConflicts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { conflictIds } = req.body

    if (!conflictIds || !Array.isArray(conflictIds)) {
      res.status(400).json({
        success: false,
        message: 'Campo "conflictIds" deve ser um array'
      })
      return
    }

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

    res.status(200).json(successResponse(result, { message: 'Auto-resolução completa' }))
  } catch (error: unknown) {
    next(internalError(
      'Erro ao auto-resolver conflitos',
      'SYNC_CONFLICT_AUTO_RESOLVE_FAILED',
      error,
    ))
  }
}

export const ignoreConflict = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
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

    const adminId = new mongoose.Types.ObjectId('000000000000000000000001')

    const conflict = await conflictDetectionService.ignoreConflict(
      new mongoose.Types.ObjectId(id),
      adminId,
      reason
    )

    res.status(200).json(successResponse({ conflict }, { message: 'Conflito ignorado com sucesso' }))
  } catch (error: unknown) {
    next(internalError('Erro ao ignorar conflito', 'SYNC_CONFLICT_IGNORE_FAILED', error))
  }
}

export const getCriticalConflicts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { limit = '20' } = req.query

    const conflicts = await conflictDetectionService.getCriticalConflicts(
      parseInt(limit as string)
    )

    res.status(200).json(successResponse({
      total: conflicts.length,
      conflicts
    }, { message: 'Conflitos críticos recuperados' }))
  } catch (error: unknown) {
    next(internalError(
      'Erro ao buscar conflitos críticos',
      'SYNC_CONFLICT_CRITICAL_LIST_FAILED',
      error,
    ))
  }
}
