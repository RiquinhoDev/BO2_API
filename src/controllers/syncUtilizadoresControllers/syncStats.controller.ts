// ════════════════════════════════════════════════════════════
// 📁 src/controllers/syncStats.controller.ts
// Controller: Sync Statistics & Conflict Management
// Endpoints para estatísticas de sync e gestão de conflitos
// ════════════════════════════════════════════════════════════

import { successResponse } from '../../contracts/responseContract'
import { NextFunction, Request, Response } from 'express'
import mongoose from 'mongoose'
import SyncHistory from '../../models/SyncModels/SyncHistory'
import { internalError } from '../../security/errorHandling'

import type { ISyncConflict } from '../../models/SyncModels/SyncConflict'
import activitySnapshotService from '../../services/syncUtilizadoresServices/activitySnapshot.service'
import  conflictDetectionService   from '../../services/syncUtilizadoresServices/conflictDetection.service'

export {
  autoResolveConflicts, bulkResolveConflicts, getConflictById, getConflicts,
  getCriticalConflicts, ignoreConflict, resolveConflict
} from '../syncStats/conflicts.controller'


// ═══════════════════════════════════════════════════════════
// GET SYNC BY ID
// GET /api/sync/history/:id
// ═══════════════════════════════════════════════════════════

export const getSyncById = async (
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

    res.status(200).json(successResponse(
      {
        sync,
        conflicts: conflicts.map((c: ISyncConflict) => ({
          id: c._id,
          type: c.conflictType,
          severity: c.severity,
          title: c.title,
          status: c.status,
          detectedAt: c.detectedAt
        }))
      },
      { message: 'Sync recuperado com sucesso' },
    ))

  } catch (error: unknown) {
    next(internalError('Erro ao buscar sync', 'SYNC_HISTORY_READ_FAILED', error))
  }
}

// ═══════════════════════════════════════════════════════════
// GET ALL CONFLICTS
// GET /api/sync/conflicts
// ═══════════════════════════════════════════════════════════

// GET ACTIVITY SNAPSHOTS STATS
// GET /api/sync/snapshots/stats
// ═══════════════════════════════════════════════════════════

export const getSnapshotStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { month, platform } = req.query

    const targetMonth = month
      ? new Date(String(month))
      : new Date()

    // Legacy raw-query compatibility: invalid/repeated platform values reached the model filter unchanged.
    const stats = await activitySnapshotService.getMonthlyStats(
      targetMonth,
      platform as any,
    )

    res.status(200).json(successResponse(
      {
        month: targetMonth.toISOString().slice(0, 7),
        platform: platform || 'all',
        stats
      },
      { message: 'Estatísticas de snapshots recuperadas' },
    ))

  } catch (error: unknown) {
    next(internalError('Erro ao buscar estatísticas', 'SYNC_SNAPSHOT_STATS_FAILED', error))
  }
}
