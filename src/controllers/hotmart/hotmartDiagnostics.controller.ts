import type { Request, Response } from 'express'
import { SyncHistory, User } from '../../models'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const findHotmartUser = async (req: Request, res: Response): Promise<void> => {
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

    res.status(200).json({
      message: 'Utilizador encontrado',
      user: {
        id: foundUser._id,
        email: foundUser.email,
        name: foundUser.name,
        hotmartUserId: foundUser.hotmart?.hotmartUserId,
        status: foundUser.combined?.status,
        progress: foundUser.combined?.totalProgress
      }
    })
  } catch (error: unknown) {
    res.status(500).json({ message: 'Erro ao buscar utilizador', error: errorMessage(error) })
  }
}

export const compareSyncMethods = async (_req: Request, res: Response): Promise<void> => {
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
    res.status(500).json({ success: false, message: errorMessage(error) })
  }
}
