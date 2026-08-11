import { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../../contracts/responseContract'
import User from '../../../models/user'
import { SyncHistory } from '../../../models'
import { internalError } from '../../../security/errorHandling'

export const getUsersWithClasses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const users = await User.find({
      'curseduca.curseducaUserId': { $exists: true }
    })
      .select('name email curseduca.enrolledClasses curseduca.groupName')
      .lean()

    const stats = {
      total: users.length,
      withSingleClass: users.filter(user => user.curseduca?.enrolledClasses?.length === 1).length,
      withMultipleClasses: users.filter(user => (user.curseduca?.enrolledClasses?.length || 0) > 1).length,
      withoutClasses: users.filter(user => !user.curseduca?.enrolledClasses?.length).length
    }

    res.json(successResponse(users, { stats }))
  } catch (error: unknown) {
    next(internalError('Erro ao buscar utilizadores CursEduca', 'CURSEDUCA_USERS_READ_FAILED', error))
  }
}

/**
 * PATCH /api/curseduca/users/:userId/classes
 * Atualizar turmas de um user
 */
export const updateUserClasses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = req.params
    const { enrolledClasses } = req.body

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'curseduca.enrolledClasses': enrolledClasses,
          'metadata.updatedAt': new Date()
        }
      },
      { new: true }
    )

    res.json(successResponse(user))
  } catch (error: unknown) {
    next(internalError('Erro ao atualizar turmas CursEduca', 'CURSEDUCA_USER_CLASSES_UPDATE_FAILED', error))
  }
}

/**
 * GET /api/curseduca/sync/compare
 * Comparar sync history
 */
export const compareSyncMethods = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const SyncReport = (await import('../../../models/SyncModels/SyncReport')).default

    const legacyHistory = await SyncHistory.find({
      $or: [
        { type: 'curseduca' },
        { syncType: 'CURSEDUCA' },
        { type: 'CURSEDUCA' }
      ]
    })
      .sort({ startedAt: -1 })
      .limit(5)
      .select('startedAt completedAt status stats type')
      .lean()

    const universalReports = await SyncReport.find({ syncType: 'curseduca' })
      .sort({ startedAt: -1 })
      .limit(5)
      .select('startedAt completedAt status stats duration')
      .lean()

    res.json({
      success: true,
      data: {
        legacy: {
          count: legacyHistory.length,
          latest: legacyHistory[0],
          all: legacyHistory
        },
        universal: {
          count: universalReports.length,
          latest: universalReports[0],
          all: universalReports
        },
        comparison: {
          avgDurationLegacy:
            legacyHistory.reduce((sum, history) => {
              const duration =
                history.completedAt && history.startedAt
                  ? (new Date(history.completedAt).getTime() - new Date(history.startedAt).getTime()) / 1000
                  : 0
              return sum + duration
            }, 0) / (legacyHistory.length || 1),

          avgDurationUniversal:
            universalReports.reduce((sum, report) => sum + (report.duration || 0), 0) /
            (universalReports.length || 1)
        }
      }
    })
  } catch (error: unknown) {
    next(internalError('Erro ao comparar sincronizações CursEduca', 'CURSEDUCA_SYNC_COMPARISON_FAILED', error))
  }
}

// ═══════════════════════════════════════════════════════════
// ENDPOINTS DEPRECADOS (501)
// ═══════════════════════════════════════════════════════════
