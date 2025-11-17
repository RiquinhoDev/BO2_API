// ════════════════════════════════════════════════════════════
// 📁 src/services/tagRuleEngine.ts
// Motor de avaliação e execução de regras de tags
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import Course, { ICourse } from '../models/Course'
import TagRule, { ITagRule, ICondition } from '../models/TagRule'
import User from '../models/user'
import UserAction from '../models/UserAction'
import CommunicationHistory from '../models/CommunicationHistory'
import activeCampaignService from './activeCampaignService'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

interface EvaluationContext {
  user: any
  course: ICourse
  userStats: {
    // Clareza stats (ACTION_BASED)
    daysSinceLastAction?: number
    currentProgress: number
    reportsOpenedLastWeek?: number
    reportsOpenedLastMonth?: number
    totalReportsOpened?: number
    
    // OGI stats (LOGIN_BASED) ← NOVO Sprint 6!
    daysSinceLastLogin?: number
    lastLogin?: Date
    
    // Comum
    currentModule?: number
  }
}

interface RuleExecutionResult {
  ruleId: string
  ruleName: string
  executed: boolean
  reason?: string
  error?: string
}

// ─────────────────────────────────────────────────────────────
// CLASSE PRINCIPAL
// ─────────────────────────────────────────────────────────────

class TagRuleEngine {
  
  // ═══════════════════════════════════════════════════════════
  // AVALIAR TODAS AS REGRAS PARA UM USER
  // ═══════════════════════════════════════════════════════════

  async evaluateUserRules(
    userId: mongoose.Types.ObjectId,
    courseId: mongoose.Types.ObjectId
  ): Promise<RuleExecutionResult[]> {
    
    const results: RuleExecutionResult[] = []

    try {
      // 1. Buscar dados necessários
      const user = await User.findById(userId)
      if (!user) {
        throw new Error(`User ${userId} não encontrado`)
      }

      const course = await Course.findById(courseId)
      if (!course) {
        throw new Error(`Course ${courseId} não encontrado`)
      }

      // 2. Calcular estatísticas do user
      const userStats = await this.calculateUserStats(user, course)

      // 3. Montar contexto de avaliação
      const context: EvaluationContext = {
        user,
        course,
        userStats
      }

      // 4. Buscar regras ativas ordenadas por prioridade
      const rules = await TagRule.find({
        courseId,
        isActive: true
      }).sort({ priority: -1 }) // Maior prioridade primeiro

      console.log(`📋 Avaliando ${rules.length} regras para ${user.email}`)

      // 5. Avaliar cada regra
      for (const rule of rules) {
        const result = await this.evaluateAndExecuteRule(rule, context)
        results.push(result)
      }

      console.log(`✅ Avaliação completa para ${user.email}`)
      return results

    } catch (error) {
      console.error(`❌ Erro ao avaliar regras:`, error)
      throw error
    }
  }

  // ═══════════════════════════════════════════════════════════
  // AVALIAR E EXECUTAR UMA REGRA
  // ═══════════════════════════════════════════════════════════

  private async evaluateAndExecuteRule(
    rule: ITagRule,
    context: EvaluationContext
  ): Promise<RuleExecutionResult> {
    
    try {
      // 1. Avaliar condições
      const conditionsMet = await this.evaluateConditions(rule.conditions, context)

      if (!conditionsMet) {
        return {
          ruleId: rule._id.toString(),
          ruleName: rule.name,
          executed: false,
          reason: 'Condições não satisfeitas'
        }
      }

      // 2. Verificar cooldown (ABORDAGEM 2!) ⭐
      const canExecute = await this.checkCooldown(
        context.user._id,
        context.course._id,
        rule.actions.addTag
      )

      if (!canExecute) {
        return {
          ruleId: rule._id.toString(),
          ruleName: rule.name,
          executed: false,
          reason: 'Email já enviado recentemente (cooldown)'
        }
      }

      // 3. Executar ações
      await this.executeRuleActions(rule, context)

      return {
        ruleId: rule._id.toString(),
        ruleName: rule.name,
        executed: true
      }

    } catch (error: any) {
      return {
        ruleId: rule._id.toString(),
        ruleName: rule.name,
        executed: false,
        error: error.message
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // AVALIAR CONDIÇÕES
  // ═══════════════════════════════════════════════════════════

  private async evaluateConditions(
    conditions: ICondition[],
    context: EvaluationContext
  ): Promise<boolean> {
    
    for (const condition of conditions) {
      if (condition.type === 'SIMPLE') {
        const result = this.evaluateSimpleCondition(condition, context)
        if (!result) return false
      } else if (condition.type === 'COMPOUND') {
        const result = this.evaluateCompoundCondition(condition, context)
        if (!result) return false
      }
    }

    return true
  }

  private evaluateSimpleCondition(
    condition: ICondition,
    context: EvaluationContext
  ): boolean {
    
    const { field, operator, value, unit } = condition
    if (!field || !operator || value === undefined) return false

    const actualValue = this.getFieldValue(field, context)
    if (actualValue === null) return false

    switch (operator) {
      case 'olderThan':
        return actualValue > value
      case 'newerThan':
        return actualValue < value
      case 'equals':
        return actualValue === value
      case 'greaterThan':
        return actualValue > value
      case 'lessThan':
        return actualValue < value
      default:
        return false
    }
  }

  private evaluateCompoundCondition(
    condition: ICondition,
    context: EvaluationContext
  ): boolean {
    
    const { logic, subConditions } = condition
    if (!subConditions || subConditions.length === 0) return false

    const results = subConditions.map(sub => {
      const actualValue = this.getFieldValue(sub.field, context)
      if (actualValue === null) return false

      switch (sub.operator) {
        case 'olderThan':
          return actualValue > sub.value
        case 'newerThan':
          return actualValue < sub.value
        case 'equals':
          return actualValue === sub.value
        case 'greaterThan':
          return actualValue > sub.value
        case 'lessThan':
          return actualValue < sub.value
        default:
          return false
      }
    })

    if (logic === 'AND') {
      return results.every(r => r === true)
    } else if (logic === 'OR') {
      return results.some(r => r === true)
    }

    return false
  }

  private getFieldValue(field: string, context: EvaluationContext): number | null {
    const { userStats } = context

    switch (field) {
      // ───── Clareza fields (ACTION_BASED) ─────
      case 'lastAccessDate':
      case 'lastReportOpenedAt':
      case 'lastModuleCompletedAt':
      case 'lastReportOpened':
        return userStats.daysSinceLastAction || 0
      
      case 'reportsOpenedLastWeek':
        return userStats.reportsOpenedLastWeek || 0
      
      case 'reportsOpenedLastMonth':
        return userStats.reportsOpenedLastMonth || 0
      
      case 'totalReportsOpened':
        return userStats.totalReportsOpened || 0
      
      // ───── OGI fields (LOGIN_BASED) ← NOVO Sprint 6! ─────
      case 'lastLogin':
      case 'daysSinceLastLogin':
        return userStats.daysSinceLastLogin || 0
      
      // ───── Campos comuns ─────
      case 'currentProgress':
        return userStats.currentProgress || 0
      
      case 'currentModule':
        return userStats.currentModule || 0
      
      default:
        console.warn(`⚠️ Campo desconhecido: ${field}`)
        return null
    }
  }

  // ═══════════════════════════════════════════════════════════
  // VERIFICAR COOLDOWN (ABORDAGEM 2) ⭐⭐⭐
  // ═══════════════════════════════════════════════════════════

  private async checkCooldown(
    userId: mongoose.Types.ObjectId,
    courseId: mongoose.Types.ObjectId,
    tagName: string,
    cooldownDays: number = 30
  ): Promise<boolean> {
    
    try {
      // Calcular data de corte (30 dias atrás)
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - cooldownDays)

      // Verificar se já enviámos este email recentemente
      const recentCommunication = await CommunicationHistory.findOne({
        userId,
        courseId,
        tagApplied: tagName,
        sentAt: { $gte: cutoffDate }
      })

      if (recentCommunication) {
        const daysSince = Math.floor(
          (Date.now() - recentCommunication.sentAt!.getTime()) / (1000 * 60 * 60 * 24)
        )
        console.log(`⏸️ Tag "${tagName}" já aplicada há ${daysSince} dias (cooldown: ${cooldownDays}d)`)
        return false
      }

      return true

    } catch (error) {
      console.error(`❌ Erro ao verificar cooldown:`, error)
      return false
    }
  }

  // ═══════════════════════════════════════════════════════════
  // EXECUTAR AÇÕES DA REGRA
  // ═══════════════════════════════════════════════════════════

  private async executeRuleActions(
    rule: ITagRule,
    context: EvaluationContext
  ): Promise<void> {
    
    const { user, course, userStats } = context
    const { addTag, removeTags } = rule.actions

    try {
      // 1. Remover tags antigas primeiro
      if (removeTags && removeTags.length > 0) {
        console.log(`🗑️ Removendo tags: ${removeTags.join(', ')}`)
        await activeCampaignService.removeTags(user.email, removeTags)
      }

      // 2. Adicionar nova tag
      console.log(`✅ Aplicando tag: ${addTag}`)
      await activeCampaignService.addTag(user.email, addTag)

      // 3. Registar em CommunicationHistory ⭐⭐⭐
      await CommunicationHistory.create({
        userId: user._id,
        courseId: course._id,
        tagRuleId: rule._id,
        tagApplied: addTag,
        status: 'SENT',
        sentAt: new Date(),
        source: 'AUTOMATIC',
        userStateSnapshot: {
          daysSinceLastAction: userStats.daysSinceLastAction,
          currentProgress: userStats.currentProgress,
          currentPhase: 'ENGAGEMENT' // TODO: Determinar fase dinamicamente
        }
      })

      console.log(`📝 Comunicação registada em histórico`)

      // 4. Atualizar lastRunAt da regra
      rule.lastRunAt = new Date()
      await rule.save()

    } catch (error) {
      console.error(`❌ Erro ao executar ações da regra "${rule.name}":`, error)
      throw error
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CALCULAR ESTATÍSTICAS DO USER
  // ═══════════════════════════════════════════════════════════

  private async calculateUserStats(
    user: any,
    course: ICourse
  ): Promise<any> {
    
    try {
      const now = new Date()

      // Estatísticas base
      const stats: any = {
        daysSinceLastAction: 0,
        currentProgress: user.combined?.totalProgress || 0
      }

      // Tracking específico por tipo de curso
      if (course.trackingType === 'ACTION_BASED') {
        // Para cursos ACTION_BASED (ex: Clareza)
        const lastAction = await UserAction.findOne({
          userId: user._id,
          courseId: course._id,
          actionType: course.trackingConfig.actionType
        }).sort({ timestamp: -1 })

        if (lastAction) {
          const diffTime = now.getTime() - lastAction.timestamp.getTime()
          stats.daysSinceLastAction = Math.floor(diffTime / (1000 * 60 * 60 * 24))
        } else {
          stats.daysSinceLastAction = 999 // Nunca teve ação
        }

        // Contar ações na última semana
        const lastWeekDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        stats.reportsOpenedLastWeek = await UserAction.countDocuments({
          userId: user._id,
          courseId: course._id,
          actionType: 'REPORT_OPENED',
          timestamp: { $gte: lastWeekDate }
        })

        // Contar ações no último mês
        const lastMonthDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        stats.reportsOpenedLastMonth = await UserAction.countDocuments({
          userId: user._id,
          courseId: course._id,
          actionType: 'REPORT_OPENED',
          timestamp: { $gte: lastMonthDate }
        })

        // Total de ações
        stats.totalReportsOpened = await UserAction.countDocuments({
          userId: user._id,
          courseId: course._id,
          actionType: 'REPORT_OPENED'
        })

      } else if (course.trackingType === 'LOGIN_BASED') {
        // ─────────────────────────────────────────────────────────
        // Para cursos LOGIN_BASED (ex: OGI) ← ATUALIZADO Sprint 6!
        // ─────────────────────────────────────────────────────────
        
        // Buscar último login do user
        const lastLoginAction = await UserAction.findOne({
          userId: user._id,
          courseId: course._id,
          actionType: 'LOGIN'
        }).sort({ actionDate: -1 })

        if (lastLoginAction) {
          const lastLogin = new Date(lastLoginAction.actionDate)
          stats.lastLogin = lastLogin
          stats.daysSinceLastLogin = Math.floor(
            (now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24)
          )
        } else {
          // Se nunca fez login, considerar dias desde criação do user
          const userCreated = user.metadata?.createdAt || user.createdAt || now
          stats.daysSinceLastLogin = Math.floor(
            (now.getTime() - userCreated.getTime()) / (1000 * 60 * 60 * 24)
          )
        }

        // Progress (pode vir de communicationByCourse ou hotmart)
        const communicationData = user.communicationByCourse?.get(course.code)
        if (communicationData) {
          stats.currentProgress = communicationData.courseSpecificData?.currentModule || 0
          stats.currentModule = communicationData.courseSpecificData?.currentModule || 0
        } else {
          stats.currentProgress = user.hotmart?.progress?.totalProgress || 0
          stats.currentModule = user.hotmart?.progress?.currentModule || 0
        }
      }

      return stats

    } catch (error) {
      console.error(`❌ Erro ao calcular estatísticas:`, error)
      throw error
    }
  }

  // ═══════════════════════════════════════════════════════════
  // AVALIAR TODOS OS USERS DE UM CURSO
  // ═══════════════════════════════════════════════════════════

  async evaluateAllUsersInCourse(courseId: mongoose.Types.ObjectId): Promise<void> {
    try {
      console.log(`🔄 Iniciando avaliação de todos os users do curso ${courseId}`)

      // Buscar todos os users ativos
      const users = await User.find({
        'combined.status': 'ACTIVE'
      })

      console.log(`👥 Encontrados ${users.length} users`)

      let successCount = 0
      let errorCount = 0

      // Avaliar cada user
      for (const user of users) {
        try {
          await this.evaluateUserRules(user._id, courseId)
          successCount++
        } catch (error) {
          console.error(`❌ Erro ao avaliar user ${user.email}:`, error)
          errorCount++
        }
      }

      console.log(`✅ Avaliação completa: ${successCount} sucesso, ${errorCount} erros`)

    } catch (error) {
      console.error(`❌ Erro ao avaliar curso:`, error)
      throw error
    }
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORT SINGLETON
// ─────────────────────────────────────────────────────────────

export default new TagRuleEngine()

