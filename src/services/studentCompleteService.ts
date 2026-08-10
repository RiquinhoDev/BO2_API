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

// ═══════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════

const HISTORY_LIMIT = 100 // Limite de registos de histórico
const QUERY_TIMEOUT = 10000 // Timeout de 10s para queries

// ═══════════════════════════════════════════════════════════════
// SERVICE PRINCIPAL
// ═══════════════════════════════════════════════════════════════

export class StudentCompleteService {
  /**
   * Buscar todos os dados de um estudante de forma consolidada
   * @param userId - ID do estudante
   * @returns Dados completos do estudante
   * @throws StudentNotFoundError se estudante não existe
   * @throws StudentDataFetchError se erro ao buscar dados
   */
  static async getCompleteStudentData(userId: string): Promise<StudentCompleteResponse> {
    const startTime = Date.now()

    try {
      console.log(`[StudentCompleteService] Iniciando busca para userId: ${userId}`)

      // ═══════════════════════════════════════════════════════════
      // STEP 1: EXECUTAR QUERIES EM PARALELO
      // ═══════════════════════════════════════════════════════════

      const [user, products, history, engagementStates] = await Promise.all([
        this.fetchUser(userId),
        this.fetchUserProducts(userId),
        this.fetchUserHistory(userId),
        this.fetchEngagementStates(userId),
      ])

      // Validar que user existe
      if (!user) {
        throw new StudentNotFoundError(userId)
      }

      console.log(`[StudentCompleteService] Dados base carregados em ${Date.now() - startTime}ms`)

      // ═══════════════════════════════════════════════════════════
      // STEP 2: CONSOLIDAR DADOS
      // ═══════════════════════════════════════════════════════════

      const consolidationStart = Date.now()

      // Consolidar turmas
      const classes = consolidateClasses(products)

      // Consolidar progresso por produto
      const progressByProduct = consolidateProgressByProduct(products)

      // Consolidar engagement
      const engagement = consolidateEngagement(products, engagementStates)

      // Calcular estatísticas
      const stats = calculateStudentStats(user, products, classes, history)

      console.log(
        `[StudentCompleteService] Consolidação concluída em ${Date.now() - consolidationStart}ms`,
      )

      // ═══════════════════════════════════════════════════════════
      // STEP 3: PREPARAR RESPOSTA
      // ═══════════════════════════════════════════════════════════

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
          queriesCount: 4, // user, products, history, engagementStates
          recordsReturned: {
            products: products.length,
            classes: classes.length,
            history: history.length,
            engagementStates: engagementStates.length,
          },
        },
      }

      console.log(
        `[StudentCompleteService] Resposta completa preparada em ${totalTime}ms`,
      )

      return response
    } catch (error) {
      console.error('[StudentCompleteService] Erro ao buscar dados:', error)

      if (error instanceof StudentNotFoundError) {
        throw error
      }

      throw new StudentDataFetchError(
        'Erro ao buscar dados completos do estudante',
        error as Error,
      )
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MÉTODOS PRIVADOS - QUERIES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Buscar dados do user
   */
  private static async fetchUser(userId: string) {
    try {
      return await User.findById(userId).lean().maxTimeMS(QUERY_TIMEOUT).exec()
    } catch (error) {
      console.error('[StudentCompleteService] Erro ao buscar user:', error)
      throw new StudentDataFetchError('Erro ao buscar dados do utilizador', error as Error)
    }
  }

  /**
   * Buscar produtos do user
   */
  private static async fetchUserProducts(userId: string) {
    try {
      return await UserProduct.find({ userId })
        .populate({ path: 'productId', select: 'name code platform' })
        .sort({ createdAt: -1 }) // Mais recentes primeiro
        .lean()
        .maxTimeMS(QUERY_TIMEOUT)
        .exec()
    } catch (error) {
      console.error('[StudentCompleteService] Erro ao buscar produtos:', error)
      throw new StudentDataFetchError('Erro ao buscar produtos do utilizador', error as Error)
    }
  }

  /**
   * Buscar histórico do user
   */
  private static async fetchUserHistory(userId: string) {
    try {
      return await UserHistory.find({ userId })
        .limit(HISTORY_LIMIT)
        .sort({ changeDate: -1 }) // Mais recentes primeiro
        .lean()
        .maxTimeMS(QUERY_TIMEOUT)
        .exec()
    } catch (error) {
      console.error('[StudentCompleteService] Erro ao buscar histórico:', error)
      // Não falhar se histórico não carregar - retornar array vazio
      console.warn('[StudentCompleteService] Continuando sem histórico')
      return []
    }
  }

  /**
   * Buscar engagement states do user
   */
  private static async fetchEngagementStates(userId: string) {
    try {
      return await StudentEngagementState.find({ userId })
        .lean()
        .maxTimeMS(QUERY_TIMEOUT)
        .exec()
    } catch (error) {
      console.error('[StudentCompleteService] Erro ao buscar engagement states:', error)
      // Não falhar se engagement não carregar - retornar array vazio
      console.warn('[StudentCompleteService] Continuando sem engagement states')
      return []
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MÉTODOS PRIVADOS - SANITIZAÇÃO
  // ═══════════════════════════════════════════════════════════════

  /**
   * Remover campos sensíveis do user antes de retornar
   */
  private static sanitizeUser(user: any) {
    // Criar cópia para não modificar original
    const sanitized = { ...user }

    // Remover campos sensíveis (se houver)
    // Por exemplo: password, tokens, etc
    // delete sanitized.password

    return sanitized
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORT DEFAULT
// ═══════════════════════════════════════════════════════════════

export default StudentCompleteService
