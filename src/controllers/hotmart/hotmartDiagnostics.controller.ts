import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { IntegrationUnavailableError } from '../../errors/integrationUnavailableError'
import { internalError } from '../../security/errorHandling'
import { SyncHistory, User } from '../../models'

function forwardHotmartError(
  next: NextFunction,
  error: unknown,
  publicMessage: string,
  code: string,
): void {
  if (error instanceof IntegrationUnavailableError) {
    next(error)
    return
  }
  next(internalError(publicMessage, code, error))
}
export const findHotmartUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.query

    if (!email) {
      res.status(400).json({ message: 'Email é obrigatório' })
      return
    }

    const foundUser = await User.findOne({ email: String(email) })

    if (!foundUser) {
      res.status(404).json({ message: 'Utilizador não encontrado' })
      return
    }

    res.status(200).json(successResponse({
        id: foundUser._id,
        email: foundUser.email,
        name: foundUser.name,
        hotmartUserId: foundUser.hotmart?.hotmartUserId,
        status: foundUser.combined?.status,
        progress: foundUser.combined?.totalProgress
      }, { message: 'Utilizador encontrado' }))
  } catch (error: unknown) {
    forwardHotmartError(next, error, 'Erro ao buscar utilizador', 'HOTMART_USER_READ_FAILED')
  }
}

export const compareSyncMethods = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const SyncReport = (await import('../../models/SyncModels/SyncReport')).default
    const legacyHistory = await SyncHistory.find({ type: 'hotmart' })
      .sort({ startedAt: -1 })
      .limit(5)
      .select('startedAt completedAt status stats')
      .lean()
    const universalReports = await SyncReport.find({ syncType: 'hotmart' })
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
          avgDurationLegacy: legacyHistory.reduce((sum, history) => {
            const duration = history.completedAt && history.startedAt
              ? (new Date(history.completedAt).getTime() - new Date(history.startedAt).getTime()) / 1000
              : 0
            return sum + duration
          }, 0) / (legacyHistory.length || 1),
          avgDurationUniversal: universalReports.reduce(
            (sum, report) => sum + (report.duration || 0),
            0
          ) / (universalReports.length || 1)
        }
      }
    })
  } catch (error: unknown) {
    forwardHotmartError(next, error, 'Erro ao comparar sincronizações Hotmart', 'HOTMART_SYNC_COMPARISON_FAILED')
  }
}
