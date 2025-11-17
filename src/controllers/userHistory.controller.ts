import { Request, Response } from 'express'
import { ensureUserHistoryModel } from '../models/UserHistory'
import mongoose from 'mongoose'

// Buscar histórico de um usuário específico
export const getUserHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, email } = req.query
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
    
    if (!userId && !email) {
      res.status(400).json({
        success: false,
        message: 'userId ou email são obrigatórios'
      })
      return
    }

    const UserHistoryModel = ensureUserHistoryModel()
    
    // Determinar filtro baseado no parâmetro fornecido
    let filter: any = {}
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId as string)) {
        res.status(400).json({
          success: false,
          message: 'userId inválido'
        })
        return
      }
      filter.userId = new mongoose.Types.ObjectId(userId as string)
    } else if (email) {
      filter.userEmail = (email as string).toLowerCase().trim()
    }

    // Buscar histórico
    const history = await UserHistoryModel.find(filter)
      .sort({ changeDate: -1 })
      .limit(limit)
      .populate('syncId', 'startTime endTime status totalUsers processedUsers errors')
      .lean()

    // Estatísticas do histórico
    const stats = await UserHistoryModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$changeType',
          count: { $sum: 1 },
          lastChange: { $max: '$changeDate' }
        }
      }
    ])

    const summary = {
      totalChanges: history.length,
      changeTypes: stats.reduce((acc: any, stat: any) => {
        acc[stat._id] = {
          count: stat.count,
          lastChange: stat.lastChange
        }
        return acc
      }, {}),
      hasClassChanges: stats.some((s: any) => s._id === 'CLASS_CHANGE'),
      hasEmailChanges: stats.some((s: any) => s._id === 'EMAIL_CHANGE'),
      hasManualEdits: stats.some((s: any) => s._id === 'MANUAL_EDIT')
    }

    res.json({
      success: true,
      data: {
        history,
        summary,
        pagination: {
          limit,
          total: history.length,
          hasMore: history.length === limit
        }
      },
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar histórico do usuário:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar histórico do usuário',
      details: error.message
    })
  }
}

// Buscar histórico geral (para admin)
export const getAllHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1)
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
    const changeType = req.query.changeType as string
    const source = req.query.source as string
    
    const skip = (page - 1) * limit

    const UserHistoryModel = ensureUserHistoryModel()
    
    // Construir filtro
    const filter: any = {}
    if (changeType) {
      filter.changeType = changeType
    }
    if (source) {
      filter.source = source
    }

    // Buscar histórico com paginação
    const [history, totalCount] = await Promise.all([
      UserHistoryModel.find(filter)
        .sort({ changeDate: -1 })
        .skip(skip)
        .limit(limit)
        .populate('syncId', 'startTime endTime status totalUsers')
        .lean(),
      UserHistoryModel.countDocuments(filter)
    ])

    // Estatísticas gerais
    const stats = await UserHistoryModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            changeType: '$changeType',
            source: '$source'
          },
          count: { $sum: 1 },
          lastChange: { $max: '$changeDate' }
        }
      }
    ])

    res.json({
      success: true,
      data: {
        history,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNext: skip + limit < totalCount,
          hasPrev: page > 1
        },
        stats: stats.reduce((acc: any, stat: any) => {
          const key = `${stat._id.changeType}_${stat._id.source}`
          acc[key] = {
            count: stat.count,
            lastChange: stat.lastChange
          }
          return acc
        }, {})
      },
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar histórico geral:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar histórico geral',
      details: error.message
    })
  }
}

// Criar entrada manual no histórico (para edições administrativas)
export const createManualHistoryEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, userEmail, changeType, previousValue, newValue, reason, changedBy } = req.body

    if (!userId || !userEmail || !changeType) {
      res.status(400).json({
        success: false,
        message: 'userId, userEmail e changeType são obrigatórios'
      })
      return
    }

    const UserHistoryModel = ensureUserHistoryModel()

    const historyEntry = await UserHistoryModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      userEmail: userEmail.toLowerCase().trim(),
      changeType,
      previousValue: previousValue || {},
      newValue: newValue || {},
      changeDate: new Date(),
      source: 'MANUAL',
      changedBy: changedBy || 'admin',
      reason: reason || 'Edição manual'
    })

    res.status(201).json({
      success: true,
      data: historyEntry,
      message: 'Entrada de histórico criada com sucesso'
    })

  } catch (error: any) {
    console.error('❌ Erro ao criar entrada de histórico:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao criar entrada de histórico',
      details: error.message
    })
  }
}
