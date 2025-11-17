// ================================================================
// 🧠 DECISION ENGINE SERVICE
// ================================================================
// Motor de decisão inteligente para reengajamento de alunos
// Decide quando aplicar, remover ou escalar tags baseado em:
// - Inatividade do aluno
// - Perfil do produto
// - Cooldowns
// - Progresso recente
// ================================================================

import ProductProfile, { IProductProfile, IReengagementLevel } from '../models/ProductProfile'
import StudentEngagementState, { IStudentEngagementState } from '../models/StudentEngagementState'
import User from '../models/user'
import UserAction from '../models/UserAction'

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

export type DecisionAction = 
  | 'APPLY_TAG'        // Aplicar primeira tag (Nível 1)
  | 'REMOVE_TAG'       // Remover tag atual (aluno voltou)
  | 'ESCALATE'         // Escalar para próximo nível
  | 'DESESCALATE'      // Desescalar (aluno fez progresso)
  | 'NO_ACTION'        // Nenhuma ação necessária

export interface DecisionResult {
  action: DecisionAction
  level?: number                    // Nível a aplicar (se aplicável)
  tag?: string                      // Tag a aplicar/remover
  reason: string                    // Motivo da decisão
  confidence: number                // Confiança na decisão (0-100)
  shouldExecute: boolean           // Se deve executar a ação
  nextEvaluationDate?: Date        // Quando reavaliar
  metadata?: {                     // Metadados extras
    daysInactive?: number
    currentLevel?: number
    appropriateLevel?: number
    inCooldown?: boolean
    cooldownUntil?: Date
    recentProgress?: string
  }
}

// ─────────────────────────────────────────────────────────────
// CLASSE DECISION ENGINE
// ─────────────────────────────────────────────────────────────

class DecisionEngine {
  
  /**
   * 🎯 MÉTODO PRINCIPAL: Avaliar aluno e decidir próxima ação
   */
  async evaluateStudent(
    userId: string,
    productCode: string
  ): Promise<DecisionResult> {
    
    try {
      // ===== 1. BUSCAR PRODUCT PROFILE =====
      const profile = await ProductProfile.findOne({ 
        code: productCode.toUpperCase(), 
        isActive: true 
      })

      if (!profile) {
        return {
          action: 'NO_ACTION',
          reason: `Perfil de produto '${productCode}' não encontrado ou inativo`,
          confidence: 100,
          shouldExecute: false
        }
      }

      // ===== 2. BUSCAR ESTADO DO ALUNO =====
      let studentState = await StudentEngagementState.findOne({ 
        userId, 
        productCode: productCode.toUpperCase() 
      })

      // Se não existe estado, criar
      if (!studentState) {
        studentState = await StudentEngagementState.create({
          userId,
          productCode: productCode.toUpperCase(),
          currentState: 'ACTIVE',
          daysSinceLastLogin: 0,
          tagsHistory: [],
          totalEmailsSent: 0,
          totalReturns: 0,
          stats: {
            totalDaysInactive: 0,
            currentStreakInactive: 0,
            longestStreakInactive: 0
          }
        }) as IStudentEngagementState
      }

      // ===== 3. BUSCAR USER =====
      const user = await User.findById(userId)
      if (!user) {
        return {
          action: 'NO_ACTION',
          reason: 'Utilizador não encontrado',
          confidence: 100,
          shouldExecute: false
        }
      }

      // ===== 4. CALCULAR INATIVIDADE =====
      const lastActivity = this.getLastActivity(user, productCode)
      const daysInactive = this.calculateDaysInactive(lastActivity)

      // Atualizar estado do aluno com dias de inatividade
      studentState.updateDaysInactive(daysInactive)

      // ===== 5. VERIFICAR COOLDOWN =====
      if (this.isInCooldown(studentState, profile)) {
        return {
          action: 'NO_ACTION',
          reason: `Em cooldown até ${studentState.cooldownUntil?.toISOString()}`,
          confidence: 100,
          shouldExecute: false,
          nextEvaluationDate: studentState.cooldownUntil || undefined,
          metadata: {
            daysInactive,
            currentLevel: studentState.currentLevel,
            inCooldown: true,
            cooldownUntil: studentState.cooldownUntil
          }
        }
      }

      // ===== 6. VERIFICAR PROGRESSO RECENTE =====
      const recentProgress = await this.checkRecentProgress(userId, productCode, profile)
      
      if (recentProgress && studentState.currentLevel) {
        // Aluno fez progresso → desescalar (remover tag)
        return {
          action: 'DESESCALATE',
          level: 0,
          tag: studentState.currentTagAC,
          reason: `Progresso recente detectado: ${recentProgress.type} (${recentProgress.value})`,
          confidence: 95,
          shouldExecute: true,
          metadata: {
            daysInactive,
            currentLevel: studentState.currentLevel,
            recentProgress: `${recentProgress.type}: ${recentProgress.value}`
          }
        }
      }

      // ===== 7. DETERMINAR NÍVEL APROPRIADO =====
      const appropriateLevel = this.determineAppropriateLevel(daysInactive, profile)
      const currentLevel = studentState.currentLevel || 0

      // ===== 8. TOMAR DECISÃO =====
      
      // Se aluno está ativo (0 dias inativo) e tem tag aplicada → remover
      if (daysInactive === 0 && currentLevel > 0) {
        return {
          action: 'REMOVE_TAG',
          level: 0,
          tag: studentState.currentTagAC,
          reason: 'Aluno voltou a ser ativo (0 dias inativo)',
          confidence: 100,
          shouldExecute: true,
          metadata: {
            daysInactive,
            currentLevel
          }
        }
      }

      // Se apropriado level > atual → escalar
      if (appropriateLevel > currentLevel) {
        const levelConfig = profile.reengagementLevels.find(l => l.level === appropriateLevel)
        
        if (!levelConfig) {
          return {
            action: 'NO_ACTION',
            reason: `Nível ${appropriateLevel} não configurado`,
            confidence: 100,
            shouldExecute: false,
            metadata: {
              daysInactive,
              currentLevel,
              appropriateLevel
            }
          }
        }

        const action: DecisionAction = currentLevel === 0 ? 'APPLY_TAG' : 'ESCALATE'
        
        return {
          action,
          level: appropriateLevel,
          tag: levelConfig.tagAC,
          reason: `${daysInactive} dias inativo → ${action === 'APPLY_TAG' ? 'aplicar' : 'escalar para'} Nível ${appropriateLevel}`,
          confidence: this.calculateConfidence(daysInactive, appropriateLevel, profile, levelConfig),
          shouldExecute: true,
          metadata: {
            daysInactive,
            currentLevel,
            appropriateLevel
          }
        }
      }

      // Se apropriado level < atual → desescalar (improvável, mas possível se config mudou)
      if (appropriateLevel < currentLevel && appropriateLevel === 0) {
        return {
          action: 'DESESCALATE',
          level: 0,
          tag: studentState.currentTagAC,
          reason: 'Configuração de níveis mudou - desescalando',
          confidence: 80,
          shouldExecute: true,
          metadata: {
            daysInactive,
            currentLevel,
            appropriateLevel
          }
        }
      }

      // Nenhuma ação necessária
      return {
        action: 'NO_ACTION',
        reason: `Aluno no nível correto (Nível ${currentLevel}, ${daysInactive} dias inativo)`,
        confidence: 100,
        shouldExecute: false,
        metadata: {
          daysInactive,
          currentLevel,
          appropriateLevel
        }
      }

    } catch (error: any) {
      console.error(`❌ Erro ao avaliar aluno ${userId}:`, error)
      return {
        action: 'NO_ACTION',
        reason: `Erro: ${error.message}`,
        confidence: 0,
        shouldExecute: false
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // MÉTODOS AUXILIARES
  // ─────────────────────────────────────────────────────────────

  /**
   * Obter última atividade do aluno no produto
   */
  private getLastActivity(user: any, productCode: string): Date {
    // Tentar obter de communicationByCourse
    const courseData = user.communicationByCourse?.get(productCode)
    
    if (courseData?.lastActivityDate) {
      return courseData.lastActivityDate
    }

    // Fallback: usar lastLogin geral
    if (user.lastLogin) {
      return user.lastLogin
    }

    // Se não tem nenhum dado, usar data de criação do user
    return user.createdAt || new Date()
  }

  /**
   * Calcular dias de inatividade
   */
  private calculateDaysInactive(lastActivity: Date): number {
    const now = new Date()
    const diffMs = now.getTime() - lastActivity.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    return Math.max(0, diffDays)
  }

  /**
   * Verificar se está em cooldown
   */
  private isInCooldown(
    studentState: IStudentEngagementState,
    profile: IProductProfile
  ): boolean {
    if (!studentState.cooldownUntil) return false
    
    const now = new Date()
    return now < studentState.cooldownUntil
  }

  /**
   * Determinar nível apropriado baseado em dias de inatividade
   */
  private determineAppropriateLevel(
    daysInactive: number,
    profile: IProductProfile
  ): number {
    
    if (daysInactive === 0) {
      return 0 // Aluno ativo
    }

    // Ordenar níveis por dias de inatividade (crescente)
    const sortedLevels = [...profile.reengagementLevels]
      .sort((a, b) => a.daysInactive - b.daysInactive)

    // Encontrar o nível mais alto que o aluno atingiu
    let appropriateLevel = 0

    for (const level of sortedLevels) {
      if (daysInactive >= level.daysInactive) {
        appropriateLevel = level.level
      } else {
        break // Não atingiu este nível ainda
      }
    }

    return appropriateLevel
  }

  /**
   * Verificar progresso recente (últimas 24-48h)
   */
  private async checkRecentProgress(
    userId: string,
    productCode: string,
    profile: IProductProfile
  ): Promise<{ type: string; value: number } | null> {
    
    // Verificar ações nas últimas 24 horas
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    try {
      // Verificar UserActions
      const actions = await UserAction.find({
        userId,
        productCode: productCode.toUpperCase(),
        createdAt: { $gte: twentyFourHoursAgo }
      })

      if (actions.length > 0) {
        // Verificar se tem ações primárias (definidas no profile)
        const primaryActions = actions.filter(a => 
          profile.progressDefinition.countsAsProgress.includes(a.actionType)
        )

        if (primaryActions.length > 0) {
          return {
            type: 'primary_action',
            value: primaryActions.length
          }
        }

        return {
          type: 'any_action',
          value: actions.length
        }
      }

      // Verificar login recente
      const user = await User.findById(userId)
      if (user) {
        const courseData = user.communicationByCourse?.get(productCode)
        
        if (courseData?.lastActivityDate && courseData.lastActivityDate >= twentyFourHoursAgo) {
          return {
            type: 'recent_login',
            value: 1
          }
        }

        if (user.lastLogin && user.lastLogin >= twentyFourHoursAgo) {
          return {
            type: 'general_login',
            value: 1
          }
        }
      }

      return null

    } catch (error: any) {
      console.error('❌ Erro ao verificar progresso recente:', error)
      return null
    }
  }

  /**
   * Calcular confiança na decisão (0-100)
   */
  private calculateConfidence(
    daysInactive: number,
    level: number,
    profile: IProductProfile,
    levelConfig: IReengagementLevel
  ): number {
    
    // Base: 70%
    let confidence = 70

    // Aumenta conforme excede o threshold de dias
    const daysOverThreshold = daysInactive - levelConfig.daysInactive
    
    if (daysOverThreshold >= 5) {
      confidence += 20 // Muito além do threshold
    } else if (daysOverThreshold >= 2) {
      confidence += 10 // Além do threshold
    } else if (daysOverThreshold >= 0) {
      confidence += 5 // No threshold
    }

    // Aumenta se é nível mais alto (mais urgente)
    if (level >= 3) {
      confidence += 5
    }

    return Math.min(100, confidence)
  }

  // ─────────────────────────────────────────────────────────────
  // MÉTODOS PÚBLICOS AUXILIARES
  // ─────────────────────────────────────────────────────────────

  /**
   * Avaliar múltiplos alunos de uma vez
   */
  async evaluateMultipleStudents(
    userIds: string[],
    productCode: string
  ): Promise<Map<string, DecisionResult>> {
    
    const results = new Map<string, DecisionResult>()

    for (const userId of userIds) {
      try {
        const decision = await this.evaluateStudent(userId, productCode)
        results.set(userId, decision)
      } catch (error: any) {
        console.error(`❌ Erro ao avaliar ${userId}:`, error)
        results.set(userId, {
          action: 'NO_ACTION',
          reason: `Erro: ${error.message}`,
          confidence: 0,
          shouldExecute: false
        })
      }
    }

    return results
  }

  /**
   * Obter estatísticas de decisões
   */
  async getDecisionStats(productCode: string): Promise<any> {
    try {
      const states = await StudentEngagementState.find({
        productCode: productCode.toUpperCase()
      })

      const total = states.length
      const byState: any = {}
      const byLevel: any = {}

      states.forEach(state => {
        // Contar por estado
        byState[state.currentState] = (byState[state.currentState] || 0) + 1

        // Contar por nível
        if (state.currentLevel) {
          byLevel[state.currentLevel] = (byLevel[state.currentLevel] || 0) + 1
        }
      })

      return {
        total,
        byState,
        byLevel,
        active: byState['ACTIVE'] || 0,
        atRisk: byState['AT_RISK'] || 0,
        inLevels: total - (byState['ACTIVE'] || 0) - (byState['AT_RISK'] || 0)
      }
    } catch (error: any) {
      console.error('❌ Erro ao obter estatísticas:', error)
      return null
    }
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORTAR SINGLETON
// ─────────────────────────────────────────────────────────────

export default new DecisionEngine()

