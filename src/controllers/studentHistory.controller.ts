// ══════════════════════════════════════════════════════════════════════
// 📁 src/controllers/studentHistory.controller.ts
// Controller para histórico de alterações do estudante
// ══════════════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import mongoose from 'mongoose'
import UserHistory from '../models/UserHistory'
import User from '../models/user'

// ═══════════════════════════════════════════════════════════════
// GET STUDENT HISTORY
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/students/:userId/history
 * Retorna histórico completo de alterações do estudante
 */
export const getStudentHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params
    const { limit = '50', offset = '0', changeType, platform, startDate, endDate } = req.query

    console.log(`[StudentHistoryController] Buscando histórico para userId: ${userId}`)

    // Validar userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'userId inválido'
      })
    }

    // Buscar user para validar que existe
    const user = await User.findById(userId).select('email name').lean()
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilizador não encontrado'
      })
    }

    // Build query
    const query: any = { userId: new mongoose.Types.ObjectId(userId) }

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

    const limitNum = parseInt(limit as string, 10) || 50
    const offsetNum = parseInt(offset as string, 10) || 0

    // Buscar histórico
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

    console.log(`[StudentHistoryController] ${history.length} registos encontrados em ${executionTime}ms`)

    // Agrupar por data para timeline
    const groupedHistory = groupHistoryByDate(history as any[])

    return res.status(200).json({
      success: true,
      data: {
        user: {
          _id: userId,
          email: user.email,
          name: user.name
        },
        history,
        groupedHistory,
        pagination: {
          total,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < total
        }
      },
      meta: {
        executionTime,
        totalRecords: total
      }
    })
  } catch (error: any) {
    console.error('[StudentHistoryController] Erro:', error)
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar histórico do estudante',
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════════
// GET STUDENT HISTORY SUMMARY
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/students/:userId/history/summary
 * Retorna resumo do histórico (estatísticas)
 */
export const getStudentHistorySummary = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'userId inválido'
      })
    }

    const userIdObj = new mongoose.Types.ObjectId(userId)

    // Agregar estatísticas
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
  } catch (error: any) {
    console.error('[StudentHistoryController] Erro:', error)
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar resumo do histórico',
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

interface HistoryRecord {
  _id: string
  changeDate: Date
  changeType: string
  source: string
  platform?: string
  metadata?: any
  previousValue: any
  newValue: any
}

interface GroupedHistoryDay {
  date: string // YYYY-MM-DD
  changes: HistoryRecord[]
  summary: {
    total: number
    byType: Record<string, number>
  }
}

/**
 * Agrupa histórico por dia para exibição em timeline
 */
function groupHistoryByDate(history: HistoryRecord[]): GroupedHistoryDay[] {
  const grouped = new Map<string, HistoryRecord[]>()

  history.forEach((record) => {
    const date = new Date(record.changeDate)
    const dateKey = date.toISOString().split('T')[0] // YYYY-MM-DD

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, [])
    }
    grouped.get(dateKey)!.push(record)
  })

  const result: GroupedHistoryDay[] = []

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

  // Ordenar por data decrescente
  result.sort((a, b) => b.date.localeCompare(a.date))

  return result
}
