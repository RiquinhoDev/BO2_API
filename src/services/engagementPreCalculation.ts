// src/services/engagementPreCalculation.ts - VERSÃO FINAL CORRIGIDA
import User, { IUser } from '../models/user' // ✅ IMPORT DO MODELO E INTERFACE
import { calculateCombinedEngagement } from '../utils/engagementCalculator'

// ✅ INTERFACES AUXILIARES para resolver problemas de tipos
interface UserIdOnly {
  _id: string
}

interface UserWithEngagementFields {
  _id: string
  email: string
  engagement?: string
  accessCount?: number
  progress?: {
    completedPercentage?: number
    completed?: number
    total?: number
    lessons?: any[]
    lastUpdated?: Date
  }
  engagementScore?: number
  engagementLevel?: string
  engagementCalculatedAt?: Date
}

export class EngagementPreCalculationService {
  
  /**
   * 🎯 PRÉ-CALCULAR engagement para um utilizador específico
   */
  async preCalculateUserEngagement(userId: string): Promise<void> {
    try {
      const user = await User.findById(userId).lean() as UserWithEngagementFields | null
      if (!user) throw new Error('Utilizador não encontrado')

      const engagementData = calculateCombinedEngagement({
        engagement: user.engagement,
        accessCount: user.accessCount,
        progress: user.progress
      })

      await User.findByIdAndUpdate(userId, {
        engagementScore: engagementData.score,
        engagementLevel: engagementData.level,
        engagementCalculatedAt: new Date()
      })

      console.log(`✅ Engagement pré-calculado para ${user.email}: ${engagementData.score}/100`)
    } catch (error) {
      console.error(`❌ Erro ao pré-calcular engagement para ${userId}:`, error)
    }
  }

  /**
   * 🔄 PRÉ-CALCULAR para todos os utilizadores (lotes)
   */
// MÉTODO CORRIGIDO - Pré-calcular Engagement
async preCalculateAllEngagement(): Promise<void> {
  const batchSize = 100
  let skip = 0
  let processed = 0

  console.log('🔄 Iniciando pré-cálculo de engagement para todos os utilizadores...')

  while (true) {
    // ✅ CORRIGIDO: Não fazer cast, usar tipo inferido do Mongoose
    const users = await User.find({}, { _id: 1 })
      .skip(skip)
      .limit(batchSize)
      .lean()

    if (users.length === 0) break

    // ✅ CORRIGIDO: Converter _id para string explicitamente
    const promises = users.map(user => 
      this.preCalculateUserEngagement(user._id.toString())
    )

    await Promise.allSettled(promises)
    
    processed += users.length
    skip += batchSize
    
    console.log(`📊 Processados: ${processed} utilizadores`)
    
    // Pausa entre lotes para não sobrecarregar
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  console.log(`✅ Pré-cálculo concluído! Total: ${processed} utilizadores`)
}

  /**
   * 🕐 PRÉ-CALCULAR apenas utilizadores desatualizados
   */
// MÉTODO CORRIGIDO - Pré-calcular Engagement Desatualizado
async preCalculateOutdatedEngagement(hoursOld = 24): Promise<void> {
  const cutoffDate = new Date(Date.now() - hoursOld * 60 * 60 * 1000)
  
  // ✅ CORRIGIDO: Remover cast problemático
  const outdatedUsers = await User.find({
    $or: [
      { engagementCalculatedAt: { $lt: cutoffDate } },
      { engagementCalculatedAt: null }
    ]
  }, { _id: 1 }).lean()

  console.log(`🔄 Atualizando ${outdatedUsers.length} utilizadores desatualizados...`)

  for (const user of outdatedUsers) {
    await this.preCalculateUserEngagement(user._id.toString())
  }
}

  /**
   * 🧪 TESTE: Pré-calcular engagement para utilizador específico pelo email
   */
  async preCalculateUserEngagementByEmail(email: string): Promise<void> {
    try {
      const user = await User.findOne({ email: email.toLowerCase().trim() }).lean() as UserWithEngagementFields | null
      if (!user) throw new Error(`Utilizador com email ${email} não encontrado`)

      await this.preCalculateUserEngagement(user._id.toString()) // ✅ _id é string
    } catch (error) {
      console.error(`❌ Erro ao pré-calcular engagement para ${email}:`, error)
      throw error
    }
  }

  /**
   * 📊 ESTATÍSTICAS: Verificar estado do pré-cálculo
   */
  async getPreCalculationStats(): Promise<{
    total: number
    calculated: number
    outdated: number
    never: number
    percentageCalculated: number
  }> {
    const total = await User.countDocuments()
    const calculated = await User.countDocuments({ 
      engagementCalculatedAt: { $ne: null } 
    })
    
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 horas
    const outdated = await User.countDocuments({ 
      engagementCalculatedAt: { $lt: cutoffDate } 
    })
    
    const never = await User.countDocuments({ 
      engagementCalculatedAt: null 
    })

    return {
      total,
      calculated,
      outdated,
      never,
      percentageCalculated: total > 0 ? Math.round((calculated / total) * 100) : 0
    }
  }

  /**
   * 🔍 VERIFICAR: Se um utilizador precisa de recálculo
   */
  async needsRecalculation(userId: string, hoursOld = 24): Promise<boolean> {
    // ✅ INTERFACE específica para este caso
    const user = await User.findById(userId, { 
      engagementCalculatedAt: 1 
    }).lean() as { engagementCalculatedAt?: Date } | null
    
    if (!user) return false
    if (!user.engagementCalculatedAt) return true
    
    const cutoffDate = new Date(Date.now() - hoursOld * 60 * 60 * 1000)
    return user.engagementCalculatedAt < cutoffDate
  }

  /**
   * 🎯 FORÇAR: Recálculo em tempo real (para debugging)
   */
  async forceRecalculateUser(userId: string): Promise<{
    before: any
    after: any
    changed: boolean
  }> {
    // ✅ INTERFACE específica para dados antes
    const userBefore = await User.findById(userId, {
      engagementScore: 1,
      engagementLevel: 1,
      engagementCalculatedAt: 1,
      engagement: 1,
      accessCount: 1,
      progress: 1
    }).lean() as {
      engagementScore?: number
      engagementLevel?: string
      engagementCalculatedAt?: Date
      engagement?: string
      accessCount?: number
      progress?: any
    } | null

    if (!userBefore) throw new Error('Utilizador não encontrado')

    await this.preCalculateUserEngagement(userId)

    // ✅ INTERFACE específica para dados depois
    const userAfter = await User.findById(userId, {
      engagementScore: 1,
      engagementLevel: 1,
      engagementCalculatedAt: 1
    }).lean() as {
      engagementScore?: number
      engagementLevel?: string
      engagementCalculatedAt?: Date
    } | null

    return {
      before: {
        score: userBefore.engagementScore,
        level: userBefore.engagementLevel,
        calculatedAt: userBefore.engagementCalculatedAt
      },
      after: {
        score: userAfter?.engagementScore,
        level: userAfter?.engagementLevel,
        calculatedAt: userAfter?.engagementCalculatedAt
      },
      changed: userBefore.engagementScore !== userAfter?.engagementScore ||
               userBefore.engagementLevel !== userAfter?.engagementLevel
    }
  }

  /**
   * 🧪 TESTE: Obter dados de um utilizador para debugging
   */
  async getUserData(userId: string): Promise<any> {
    try {
      const user = await User.findById(userId, {
        _id: 1,
        email: 1,
        name: 1,
        engagement: 1,
        accessCount: 1,
        progress: 1,
        engagementScore: 1,
        engagementLevel: 1,
        engagementCalculatedAt: 1
      }).lean() as UserWithEngagementFields | null

      if (!user) throw new Error('Utilizador não encontrado')

      return {
        id: user._id,
        email: user.email,
        engagement: user.engagement,
        accessCount: user.accessCount,
        progress: user.progress,
        engagementScore: user.engagementScore,
        engagementLevel: user.engagementLevel,
        engagementCalculatedAt: user.engagementCalculatedAt,
        needsRecalculation: await this.needsRecalculation(user._id.toString())
      }
    } catch (error) {
      console.error(`❌ Erro ao obter dados do utilizador ${userId}:`, error)
      throw error
    }
  }

  /**
   * 🔄 TESTAR com utilizador específico
   */
  async testCalculation(userIdOrEmail: string): Promise<any> {
    try {
      let user: UserWithEngagementFields | null = null

      // Tentar encontrar por ID primeiro, depois por email
      if (userIdOrEmail.includes('@')) {
        user = await User.findOne({ email: userIdOrEmail.toLowerCase() }).lean() as UserWithEngagementFields | null
      } else {
        user = await User.findById(userIdOrEmail).lean() as UserWithEngagementFields | null
      }

      if (!user) throw new Error('Utilizador não encontrado')

      // Calcular engagement em tempo real
      const calculatedResult = calculateCombinedEngagement({
        engagement: user.engagement,
        accessCount: user.accessCount,
        progress: user.progress
      })

      console.log('🧪 TESTE DE CÁLCULO:')
      console.log('Dados entrada:', {
        engagement: user.engagement,
        accessCount: user.accessCount,
        progress: user.progress
      })
      console.log('Resultado:', calculatedResult)

      return {
        user: {
          id: user._id,
          email: user.email
        },
        inputData: {
          engagement: user.engagement,
          accessCount: user.accessCount,
          progress: user.progress
        },
        calculatedResult,
        currentStored: {
          engagementScore: user.engagementScore,
          engagementLevel: user.engagementLevel,
          calculatedAt: user.engagementCalculatedAt
        }
      }
    } catch (error) {
      console.error('❌ Erro no teste:', error)
      throw error
    }
  }

  /**
   * 📝 BATCH: Processar lote específico de utilizadores
   */
  async processBatch(userIds: string[]): Promise<{
    processed: number
    errors: number
    results: Array<{ userId: string; success: boolean; error?: string }>
  }> {
    const results: Array<{ userId: string; success: boolean; error?: string }> = []
    let processed = 0
    let errors = 0

    console.log(`📦 Processando lote de ${userIds.length} utilizadores...`)

    for (const userId of userIds) {
      try {
        await this.preCalculateUserEngagement(userId)
        results.push({ userId, success: true })
        processed++
      } catch (error: any) {
        results.push({ userId, success: false, error: error.message })
        errors++
      }
    }

    console.log(`✅ Lote processado: ${processed} sucessos, ${errors} erros`)

    return {
      processed,
      errors,
      results
    }
  }
}

export const engagementPreCalc = new EngagementPreCalculationService()