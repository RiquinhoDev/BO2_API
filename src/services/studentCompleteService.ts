// ══════════════════════════════════════════════════════════════════════
// 📁 src/services/studentCompleteService.ts
// Service para buscar dados completos de um estudante
// ══════════════════════════════════════════════════════════════════════

import User from '../models/user'
import UserProduct from '../models/UserProduct'
import UserHistory from '../models/UserHistory'
import StudentEngagementState from '../models/StudentEngagementState'

import {
  consolidateClasses,
  consolidateProgressByProduct,
  consolidateEngagement,
  calculateStudentStats,
} from '../utils/studentDataConsolidator'

import type { StudentCompleteResponse } from '../types/studentComplete'
import { StudentNotFoundError, StudentDataFetchError } from '../types/studentComplete'
import logger from '../utils/logger'

const HISTORY_LIMIT = 100
const QUERY_TIMEOUT = 10000

export class StudentCompleteService {
  static async getCompleteStudentData(userId: string): Promise<StudentCompleteResponse> {
    const startTime = Date.now()

    try {
      logger.info(`[StudentCompleteService] Iniciando busca para userId: ${userId}`)

      const [user, products, history, engagementStates] = await Promise.all([
        this.fetchUser(userId),
        this.fetchUserProducts(userId),
        this.fetchUserHistory(userId),
        this.fetchEngagementStates(userId),
      ])

      if (!user) {
        throw new StudentNotFoundError(userId)
      }

      logger.info(`[StudentCompleteService] Dados base carregados em ${Date.now() - startTime}ms`)

      const consolidationStart = Date.now()

      const classes = consolidateClasses(products)
      const progressByProduct = consolidateProgressByProduct(products)
      const engagement = consolidateEngagement(products, engagementStates)
      const stats = calculateStudentStats(user, products, classes, history)

      logger.info(
        `[StudentCompleteService] Consolidação concluída em ${Date.now() - consolidationStart}ms`,
      )

      const totalTime = Date.now() - startTime

      const response: StudentCompleteResponse = {
        success: true,
        data: {
          user: this.sanitizeUser(user),
          products,
          classes,
          progressByProduct,
          engagement,
          history,
          stats,
        },
        meta: {
          executionTime: totalTime,
          queriesCount: 4,
          recordsReturned: {
            products: products.length,
            classes: classes.length,
            history: history.length,
            engagementStates: engagementStates.length,
          },
        },
      }

      logger.info(
        `[StudentCompleteService] Resposta completa preparada em ${totalTime}ms`,
      )

      return response
    } catch (error: unknown) {
      if (error instanceof StudentNotFoundError) {
        throw error
      }

      throw new StudentDataFetchError(
        'Erro ao buscar dados completos do estudante',
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  private static async fetchUser(userId: string) {
    try {
      return await User.findById(userId).lean().maxTimeMS(QUERY_TIMEOUT).exec()
    } catch (error: unknown) {
      throw new StudentDataFetchError(
        'Erro ao buscar dados do utilizador',
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  private static async fetchUserProducts(userId: string) {
    try {
      return await UserProduct.find({ userId })
        .populate({ path: 'productId', select: 'name code platform' })
        .sort({ createdAt: -1 })
        .lean()
        .maxTimeMS(QUERY_TIMEOUT)
        .exec()
    } catch (error: unknown) {
      throw new StudentDataFetchError(
        'Erro ao buscar produtos do utilizador',
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  private static async fetchUserHistory(userId: string) {
    try {
      return await UserHistory.find({ userId })
        .limit(HISTORY_LIMIT)
        .sort({ changeDate: -1 })
        .lean()
        .maxTimeMS(QUERY_TIMEOUT)
        .exec()
    } catch {
      logger.warn('Student complete history query failed', { studentId: userId, status: 'failed' })
      logger.warn('Student complete continuing without history', { studentId: userId, status: 'partial' })
      return []
    }
  }

  private static async fetchEngagementStates(userId: string) {
    try {
      return await StudentEngagementState.find({ userId })
        .lean()
        .maxTimeMS(QUERY_TIMEOUT)
        .exec()
    } catch {
      logger.warn('Student complete engagement query failed', { studentId: userId, status: 'failed' })
      logger.warn('Student complete continuing without engagement', { studentId: userId, status: 'partial' })
      return []
    }
  }

  private static sanitizeUser<T extends object>(user: T): T {
    return { ...user }
  }
}

export default StudentCompleteService
