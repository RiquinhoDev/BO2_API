import logger from '../utils/logger'
import { successResponse } from '../contracts/responseContract'
import { NextFunction, Request, Response } from 'express'
import type { TestHistoryDeleteEventsInput } from '../security/testHistoryDestructiveInput'
import User from '../models/user'
import UserProduct from '../models/UserProduct'
import UserHistory, { type IUserHistory } from '../models/UserHistory'
import { internalError } from '../security/errorHandling'

function populatedProductName(productId: unknown): string {
  return productId !== null
    && typeof productId === 'object'
    && 'name' in productId
    && typeof productId.name === 'string'
    ? productId.name
    : 'Produto desconhecido'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * POST /api/test/history/populate-retroactive
 * Popula histórico retroativo baseado nos dados existentes dos produtos
 */
export const populateRetroactiveHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, userId } = req.body

    let user
    if (email) {
      user = await User.findOne({ email })
    } else if (userId) {
      user = await User.findById(userId)
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User não encontrado'
      })
    }

    logger.info(`\n📋 [POPULATE] Populando histórico retroativo para ${user.email}...`)

    const products = await UserProduct.find({ userId: user._id })
      .populate('productId', 'name code platform')
      .sort({ enrolledAt: 1 })

    logger.info(`✅ [POPULATE] ${products.length} produtos encontrados`)

    const historyRecords: IUserHistory[] = []
    let recordsCreated = 0

    for (const product of products) {
      const productName = populatedProductName(product.productId)
      const platform = product.platform
      const enrolledDate = product.enrolledAt || product.createdAt || new Date()

      historyRecords.push({
        userId: user._id,
        userEmail: user.email,
        changeType: 'PLATFORM_UPDATE',
        previousValue: { status: null },
        newValue: { status: 'ACTIVE' },
        platform,
        field: 'enrollment',
        action: 'create',
        changeDate: enrolledDate,
        source: platform === 'hotmart' ? 'HOTMART_SYNC' :
          platform === 'curseduca' ? 'CURSEDUCA_SYNC' : 'SYSTEM',
        metadata: {
          changeType: 'PRODUCT_ADDED',
          description: `Inscrito no produto ${productName}`,
          significance: 'HIGH',
          productId: product.productId?.toString(),
          productName,
          isRetroactive: true
        }
      })
      recordsCreated++

      let firstActivityDate = null
      if (platform === 'hotmart' && user.hotmart?.firstAccessDate) {
        firstActivityDate = new Date(user.hotmart.firstAccessDate)
      } else if (platform === 'curseduca' && user.curseduca?.joinedDate) {
        firstActivityDate = new Date(user.curseduca.joinedDate)
      }

      if (firstActivityDate && firstActivityDate > enrolledDate) {
        historyRecords.push({
          userId: user._id,
          userEmail: user.email,
          changeType: 'PLATFORM_UPDATE',
          previousValue: { totalLogins: 0 },
          newValue: { totalLogins: 1 },
          platform,
          field: 'firstActivity',
          action: 'update',
          changeDate: firstActivityDate,
          source: platform === 'hotmart' ? 'HOTMART_SYNC' :
            platform === 'curseduca' ? 'CURSEDUCA_SYNC' : 'SYSTEM',
          metadata: {
            changeType: 'LOGIN_ACTIVITY',
            description: `Primeiro acesso em ${productName}`,
            significance: 'MEDIUM',
            productId: product.productId?.toString(),
            productName,
            isRetroactive: true
          }
        })
        recordsCreated++
      }

      const currentProgress = product.progress?.percentage || 0
      if (currentProgress > 0) {
        const progressDate = product.progress?.lastActivity || product.updatedAt || new Date()

        historyRecords.push({
          userId: user._id,
          userEmail: user.email,
          changeType: 'PLATFORM_UPDATE',
          previousValue: { 'progress.percentage': 0 },
          newValue: { 'progress.percentage': currentProgress },
          platform,
          field: 'progress.percentage',
          action: 'update',
          changeDate: progressDate,
          source: platform === 'hotmart' ? 'HOTMART_SYNC' :
            platform === 'curseduca' ? 'CURSEDUCA_SYNC' : 'SYSTEM',
          metadata: {
            changeType: 'PROGRESS_INCREASE',
            description: `Atingiu ${currentProgress.toFixed(0)}% de progresso em ${productName}`,
            significance: currentProgress >= 50 ? 'HIGH' : 'MEDIUM',
            productId: product.productId?.toString(),
            productName,
            isRetroactive: true
          }
        })
        recordsCreated++
      }

      const completedLessons = product.progress?.completed || 0
      if (completedLessons > 0) {
        const lessonsDate = product.progress?.lastActivity || product.updatedAt || new Date()

        historyRecords.push({
          userId: user._id,
          userEmail: user.email,
          changeType: 'PLATFORM_UPDATE',
          previousValue: { 'progress.completed': 0 },
          newValue: { 'progress.completed': completedLessons },
          platform,
          field: 'progress.completed',
          action: 'update',
          changeDate: lessonsDate,
          source: platform === 'hotmart' ? 'HOTMART_SYNC' :
            platform === 'curseduca' ? 'CURSEDUCA_SYNC' : 'SYSTEM',
          metadata: {
            changeType: 'LESSONS_COMPLETED',
            description: `Completou ${completedLessons} lições em ${productName}`,
            significance: completedLessons >= 10 ? 'HIGH' : 'MEDIUM',
            productId: product.productId?.toString(),
            productName,
            isRetroactive: true
          }
        })
        recordsCreated++
      }

      const totalLogins = product.engagement?.totalLogins || 0
      if (totalLogins > 10) {
        const loginsDate = product.engagement?.lastLogin || product.updatedAt || new Date()

        historyRecords.push({
          userId: user._id,
          userEmail: user.email,
          changeType: 'PLATFORM_UPDATE',
          previousValue: { 'engagement.totalLogins': 0 },
          newValue: { 'engagement.totalLogins': totalLogins },
          platform,
          field: 'engagement.totalLogins',
          action: 'update',
          changeDate: loginsDate,
          source: platform === 'hotmart' ? 'HOTMART_SYNC' :
            platform === 'curseduca' ? 'CURSEDUCA_SYNC' : 'SYSTEM',
          metadata: {
            changeType: 'LOGIN_ACTIVITY',
            description: `Acumulou ${totalLogins} acessos em ${productName}`,
            significance: totalLogins >= 100 ? 'HIGH' : 'MEDIUM',
            productId: product.productId?.toString(),
            productName,
            isRetroactive: true
          }
        })
        recordsCreated++
      }

      if (product.status === 'INACTIVE') {
        const inactiveDate = product.updatedAt || new Date()

        historyRecords.push({
          userId: user._id,
          userEmail: user.email,
          changeType: 'STATUS_CHANGE',
          previousValue: { status: 'ACTIVE' },
          newValue: { status: 'INACTIVE' },
          platform,
          field: 'status',
          action: 'update',
          changeDate: inactiveDate,
          source: platform === 'hotmart' ? 'HOTMART_SYNC' :
            platform === 'curseduca' ? 'CURSEDUCA_SYNC' : 'SYSTEM',
          metadata: {
            changeType: 'PRODUCT_STATUS_CHANGE',
            description: `Status alterado para INACTIVE em ${productName}`,
            significance: 'HIGH',
            productId: product.productId?.toString(),
            productName,
            isRetroactive: true
          }
        })
        recordsCreated++
      }

      logger.info(`   ✅ [POPULATE] ${productName}: ${recordsCreated - historyRecords.length + products.length} eventos criados`)
    }

    if (historyRecords.length > 0) {
      await UserHistory.insertMany(historyRecords)
      logger.info(`\n✅ [POPULATE] ${historyRecords.length} registos de histórico criados!`)
    }

    return res.status(200).json(successResponse(
      {
        userId: user._id,
        email: user.email,
        productsProcessed: products.length,
        historyRecordsCreated: historyRecords.length,
        events: historyRecords.map((record) => ({
          date: record.changeDate,
          type: record.metadata?.changeType,
          description: record.metadata?.description
        }))
      },
      { message: 'Histórico retroativo criado com sucesso' },
    ))
  } catch (error: unknown) {
    next(internalError(
      'Erro ao popular histórico retroativo',
      'HISTORY_RETROACTIVE_POPULATE_FAILED',
      error,
    ))
  }
}

/**
 * POST /api/test/history/delete-test-events
 * Apaga eventos de teste do histórico de um user
 */
export const deleteTestEvents = async (
  input: TestHistoryDeleteEventsInput,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = input.body

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email é obrigatório'
      })
    }

    logger.info(`\n🗑️ [DELETE] Apagando eventos de teste para ${email}...`)

    const result = await UserHistory.deleteMany({
      userEmail: email,
      changeDate: new Date('2026-01-19T17:09:06.703Z')
    })

    logger.info(`✅ [DELETE] ${result.deletedCount} eventos de teste apagados`)

    await User.findOneAndUpdate(
      { email },
      { $set: { name: 'João Ferreira' } }
    )

    logger.info('✅ [DELETE] Nome do user revertido')

    return res.status(200).json(successResponse(
      { deletedCount: result.deletedCount },
      { message: 'Eventos de teste apagados com sucesso' },
    ))
  } catch (error: unknown) {
    next(internalError(
      'Erro ao apagar eventos de teste',
      'HISTORY_TEST_EVENTS_DELETE_FAILED',
      error,
    ))
  }
}

/**
 * POST /api/test/history/populate-all-users
 * Popula histórico retroativo para TODOS os users (usa com cuidado!)
 */
export const populateAllUsersHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit = 100 } = req.body

    logger.info(`\n📋 [POPULATE ALL] Populando histórico retroativo para até ${limit} users...`)

    const users = await User.find({})
      .limit(limit)
      .select('_id email')

    logger.info(`✅ [POPULATE ALL] ${users.length} users encontrados`)

    const totalRecords = 0
    const results = []

    for (const user of users) {
      try {
        const products = await UserProduct.find({ userId: user._id })
          .populate('productId', 'name code platform')

        if (products.length === 0) continue

        logger.info(`   ✅ Processado: ${user.email}`)
        results.push({
          email: user.email,
          products: products.length
        })
      } catch (error: unknown) {
        logger.error(`   ❌ Erro em ${user.email}:`, errorMessage(error))
      }
    }

    return res.status(200).json(successResponse(
      { usersProcessed: results.length, totalRecords },
      { message: `Histórico retroativo criado para ${results.length} users` },
    ))
  } catch (error: unknown) {
    next(internalError(
      'Erro ao popular histórico de todos os users',
      'HISTORY_ALL_USERS_POPULATE_FAILED',
      error,
    ))
  }
}
