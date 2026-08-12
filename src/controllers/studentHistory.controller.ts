// ══════════════════════════════════════════════════════════════════════
// 📁 src/controllers/studentHistory.controller.ts
// Controller para histórico de alterações do estudante
// ══════════════════════════════════════════════════════════════════════

import logger from '../utils/logger'
import { NextFunction, Request, Response } from 'express'
import { successResponse } from '../contracts/responseContract'
import { forwardApplicationError } from '../security/forwardApplicationError'
import mongoose, { type FilterQuery } from 'mongoose'
import UserHistory, { type IUserHistory } from '../models/UserHistory'
import User from '../models/user'

type StudentHistoryParams = {
  userId: string
}

type HistoryQuery = FilterQuery<IUserHistory> & {
  changeDate?: {
    $gte?: Date
    $lte?: Date
  }
}

// ═══════════════════════════════════════════════════════════════
// GET STUDENT HISTORY
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/students/:userId/history
 * Retorna histórico completo de alterações do estudante
 */
export const getStudentHistory = async (req: Request<StudentHistoryParams>, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params
    const { limit = '50', offset = '0', changeType, platform, startDate, endDate } = req.query

    logger.info(`[StudentHistoryController] Buscando histórico para userId: ${userId}`)

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'userId inválido'
      })
    }

    const user = await User.findById(userId).select('email name').lean()
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilizador não encontrado'
      })
    }

    const query: HistoryQuery = { userId: new mongoose.Types.ObjectId(userId) }

    if (changeType && typeof changeType === 'string') {
      query.changeType = changeType
    }

    if (platform && typeof platform === 'string') {
      query.platform = platform
    }

    if (startDate || endDate) {
      query.changeDate = {}
      if (startDate && typeof startDate === 'string') {
        query.changeDate.$gte = new Date(startDate)
      }
      if (endDate && typeof endDate === 'string') {
        query.changeDate.$lte = new Date(endDate)
      }
    }

    const limitNum = parseInt(String(limit), 10) || 50
    const offsetNum = parseInt(String(offset), 10) || 0

    const startTime = Date.now()
    const [history, total] = await Promise.all([
      UserHistory.find(query)
        .sort({ changeDate: -1 })
        .skip(offsetNum)
        .limit(limitNum)
        .lean(),
      UserHistory.countDocuments(query)
    ])

    const executionTime = Date.now() - startTime

    logger.info(`[StudentHistoryController] ${history.length} registos encontrados em ${executionTime}ms`)

    const groupedHistory = groupHistoryByDate(history)

    return res.status(200).json(successResponse({
      user: {
        _id: userId,
        email: user.email,
        name: user.name
      },
      history,
      groupedHistory,
    }, {
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < total
      },
      executionTime,
      totalRecords: total
    }))
  } catch (error: unknown) {
    return forwardApplicationError(
      next,
      error,
      'Erro ao buscar histórico do estudante',
      'STUDENT_HISTORY_READ_FAILED',
    )
  }
}

// ═══════════════════════════════════════════════════════════════
// GET STUDENT HISTORY SUMMARY
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/students/:userId/history/summary
 * Retorna resumo do histórico (estatísticas)
 */
export const getStudentHistorySummary = async (req: Request<StudentHistoryParams>, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'userId inválido'
      })
    }

    const userIdObj = new mongoose.Types.ObjectId(userId)

    const stats = await UserHistory.aggregate([
      { $match: { userId: userIdObj } },
      {
        $facet: {
          byChangeType: [
            {
              $group: {
                _id: '$changeType',
                count: { $sum: 1 },
                lastChange: { $max: '$changeDate' }
              }
            },
            { $sort: { count: -1 } }
          ],
          byPlatform: [
            {
              $group: {
                _id: '$platform',
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } }
          ],
          overall: [
            {
              $group: {
                _id: null,
                totalChanges: { $sum: 1 },
                firstChange: { $min: '$changeDate' },
                lastChange: { $max: '$changeDate' }
              }
            }
          ]
        }
      }
    ])

    const summary = {
      totalChanges: stats[0].overall[0]?.totalChanges || 0,
      firstChange: stats[0].overall[0]?.firstChange || null,
      lastChange: stats[0].overall[0]?.lastChange || null,
      byChangeType: stats[0].byChangeType,
      byPlatform: stats[0].byPlatform
    }

    return res.status(200).json({
      success: true,
      data: summary
    })
  } catch (error: unknown) {
    return forwardApplicationError(
      next,
      error,
      'Erro ao buscar resumo do histórico',
      'STUDENT_HISTORY_SUMMARY_READ_FAILED',
    )
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

interface GroupableHistoryRecord {
  changeDate: Date
  changeType: string
}

interface GroupedHistoryDay<T extends GroupableHistoryRecord> {
  date: string
  changes: T[]
  summary: {
    total: number
    byType: Record<string, number>
  }
}

/**
 * Agrupa histórico por dia para exibição em timeline
 */
function groupHistoryByDate<T extends GroupableHistoryRecord>(history: T[]): GroupedHistoryDay<T>[] {
  const grouped = new Map<string, T[]>()

  history.forEach((record) => {
    const date = new Date(record.changeDate)
    const dateKey = date.toISOString().split('T')[0]

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, [])
    }
    grouped.get(dateKey)!.push(record)
  })

  const result: GroupedHistoryDay<T>[] = []

  grouped.forEach((changes, dateKey) => {
    const byType: Record<string, number> = {}
    changes.forEach((change) => {
      byType[change.changeType] = (byType[change.changeType] || 0) + 1
    })

    result.push({
      date: dateKey,
      changes,
      summary: {
        total: changes.length,
        byType
      }
    })
  })

  result.sort((a, b) => b.date.localeCompare(a.date))

  return result
}
