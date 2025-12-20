// ════════════════════════════════════════════════════════════
// 📁 src/services/tagRuleEngine.ts
// Motor de avaliação e execução de regras de tags
// (V1 é o usado) + Extras inspirados no V2: executeAllRules, executeRuleManually,
// summary/erros agregados, rule-level cooldown via lastRunAt, e batch otimizado.
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import Course, { ICourse } from '../../models/Course'
import TagRule, { ITagRule, ICondition } from '../../models/acTags/TagRule'
import User from '../../models/user'
import UserAction from '../../models/UserAction'
import CommunicationHistory from '../../models/acTags/CommunicationHistory'
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

    // OGI stats (LOGIN_BASED)
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
  action?: 'ADD_TAG' | 'REMOVE_TAG'
}

export interface ExecutionSummary {
  rulesFound: number
  rulesExecuted: number            // regras que executaram pelo menos 1 vez
  usersEvaluated: number
  executions: number               // nº de execuções (user+rule)
  executionTimeMs: number
  errors: Array<{ ruleId: string; ruleName: string; courseId: string; error: string }>
}

// ─────────────────────────────────────────────────────────────
// CLASSE PRINCIPAL
// ─────────────────────────────────────────────────────────────

class TagRuleEngine {
  // ═══════════════════════════════════════════════════════════
  // ✅ EXTRA (do V2): EXECUTAR TODAS AS REGRAS ATIVAS (cron global)
  // Usa lastRunAt como cooldown global por regra (porque não existe cooldownHours no schema)
  // ═══════════════════════════════════════════════════════════

  async executeAllRules(params?: { ruleCooldownHours?: number }): Promise<ExecutionSummary> {
    const startTime = Date.now()
    const ruleCooldownHours = params?.ruleCooldownHours ?? 1

    const errors: ExecutionSummary['errors'] = []
    let usersEvaluated = 0
    let executions = 0
    const executedRuleIds = new Set<string>()

    const rules = await TagRule.find({ isActive: true }).sort({ priority: -1 })
    const rulesFound = rules.length

    // Agrupar por courseId para otimizar (fetch course 1x por grupo)
    const byCourse = new Map<string, ITagRule[]>()
    for (const r of rules) {
      const k = r.courseId.toString()
      if (!byCourse.has(k)) byCourse.set(k, [])
      byCourse.get(k)!.push(r)
    }

    // Query de users “ativos” (mesmo critério do teu V1 atual)
    const activeUsers = await User.find({ 'combined.status': 'ACTIVE' })

    for (const [courseIdStr, courseRules] of byCourse.entries()) {
      const course = await Course.findById(courseIdStr)
      if (!course) {
        for (const r of courseRules) {
          errors.push({
            ruleId: r.id.toString(),
            ruleName: r.name,
            courseId: courseIdStr,
            error: 'Course não encontrado'
          })
        }
        continue
      }

      // cooldown global por regra usando lastRunAt (best effort)
      const runnableRules = courseRules.filter(r => this.canRuleExecute(r, ruleCooldownHours))
      if (runnableRules.length === 0) continue

      console.log(`🔄 [TagRuleEngine] Course ${courseIdStr}: ${runnableRules.length} regras para executar`)

      // Avaliar users para este course
      for (const user of activeUsers) {
        usersEvaluated++

        let userStats: any
        try {
          userStats = await this.calculateUserStats(user, course)
        } catch (e: any) {
          // Se falhar stats, não bloqueia todo o batch
          console.warn(`⚠️ [TagRuleEngine] Stats falharam para ${user?.email}: ${e?.message || e}`)
          continue
        }

        const context: EvaluationContext = { user, course, userStats }

        for (const rule of runnableRules) {
          try {
            // 1) condições
            const conditionsMet = await this.evaluateConditions(rule.conditions, context)
            if (!conditionsMet) continue

            // 2) cooldown por tag no CommunicationHistory (já existia no V1)
            const canExecute = await this.checkCooldown(
              context.user._id,
              (context.course as any)._id as mongoose.Types.ObjectId,
              rule.actions.addTag
            )
            if (!canExecute) continue

            // 3) executar ações (sem guardar rule.lastRunAt a cada user)
            await this.executeRuleActions(rule, context, { skipRuleUpdate: true })

            executions++
            executedRuleIds.add(rule.id.toString())
          } catch (error: any) {
            errors.push({
              ruleId: rule.id.toString(),
              ruleName: rule.name,
              courseId: courseIdStr,
              error: error.message
            })
          }
        }
      }
    }

    // Atualizar lastRunAt 1x por regra que executou
    if (executedRuleIds.size > 0) {
      await TagRule.updateMany(
        { _id: { $in: Array.from(executedRuleIds).map(id => new mongoose.Types.ObjectId(id)) } },
        { $set: { lastRunAt: new Date() } }
      )
    }

    return {
      rulesFound,
      rulesExecuted: executedRuleIds.size,
      usersEvaluated,
      executions,
      executionTimeMs: Date.now() - startTime,
      errors
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ EXTRA (do V2): EXECUTAR UMA REGRA MANUALMENTE
  // ═══════════════════════════════════════════════════════════

  async executeRuleManually(ruleId: string): Promise<{
    success: boolean
    executions: number
    error?: string
  }> {
    try {
      const rule = await TagRule.findById(ruleId)
      if (!rule) return { success: false, executions: 0, error: 'Regra não encontrada' }

      const course = await Course.findById(rule.courseId)
      if (!course) return { success: false, executions: 0, error: 'Course não encontrado' }

      const users = await User.find({ 'combined.status': 'ACTIVE' })

      let executions = 0
      for (const user of users) {
        const userStats = await this.calculateUserStats(user, course)
        const context: EvaluationContext = { user, course, userStats }

        const res = await this.evaluateAndExecuteRule(rule, context, { skipRuleUpdate: true })
        if (res.executed) executions++
      }

      // marcar lastRunAt 1x
      await TagRule.findByIdAndUpdate(ruleId, { $set: { lastRunAt: new Date() } })

      return { success: true, executions }
    } catch (error: any) {
      return { success: false, executions: 0, error: error.message }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // AVALIAR TODAS AS REGRAS PARA UM USER
  // ═══════════════════════════════════════════════════════════

  async evaluateUserRules(
    userId: mongoose.Types.ObjectId,
    courseId: mongoose.Types.ObjectId
  ): Promise<RuleExecutionResult[]> {
    const results: RuleExecutionResult[] = []

    // 1. Buscar dados necessários
    const user = await User.findById(userId)
    if (!user) throw new Error(`User ${userId} não encontrado`)

    const course = await Course.findById(courseId)
    if (!course) throw new Error(`Course ${courseId} não encontrado`)

    // 2. Calcular estatísticas do user
    const userStats = await this.calculateUserStats(user, course)

    // 3. Montar contexto de avaliação
    const context: EvaluationContext = { user, course, userStats }

    // 4. Buscar regras ativas ordenadas por prioridade
    const rules = await TagRule.find({ courseId, isActive: true }).sort({ priority: -1 })
    console.log(`📋 Avaliando ${rules.length} regras para ${user.email}`)

    // 5. Avaliar cada regra
    for (const rule of rules) {
      const result = await this.evaluateAndExecuteRule(rule, context)
      results.push(result)
    }

    console.log(`✅ Avaliação completa para ${user.email}`)
    return results
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ OTIMIZAÇÃO: AVALIAR TODOS OS USERS DE UM CURSO (sem repetir fetch de rules/course por user)
  // ═══════════════════════════════════════════════════════════

  async evaluateAllUsersInCourse(courseId: mongoose.Types.ObjectId): Promise<void> {
    console.log(`🔄 Iniciando avaliação de todos os users do curso ${courseId}`)

    const course = await Course.findById(courseId)
    if (!course) throw new Error(`Course ${courseId} não encontrado`)

    const rules = await TagRule.find({ courseId, isActive: true }).sort({ priority: -1 })
    console.log(`📋 Course ${courseId}: ${rules.length} regras ativas`)

    const users = await User.find({ 'combined.status': 'ACTIVE' })
    console.log(`👥 Encontrados ${users.length} users`)

    let successCount = 0
    let errorCount = 0

    for (const user of users) {
      try {
        const userStats = await this.calculateUserStats(user, course)
        const context: EvaluationContext = { user, course, userStats }

        for (const rule of rules) {
          await this.evaluateAndExecuteRule(rule, context, { skipRuleUpdate: true })
        }

        successCount++
      } catch (error) {
        console.error(`❌ Erro ao avaliar user ${user.email}:`, error)
        errorCount++
      }
    }

    // Atualizar lastRunAt 1x para as regras do curso (best effort)
    await TagRule.updateMany(
      { courseId, isActive: true },
      { $set: { lastRunAt: new Date() } }
    )

    console.log(`✅ Avaliação completa: ${successCount} sucesso, ${errorCount} erros`)
  }

  // ═══════════════════════════════════════════════════════════
  // AVALIAR E EXECUTAR UMA REGRA
  // ═══════════════════════════════════════════════════════════

  private async evaluateAndExecuteRule(
    rule: ITagRule,
    context: EvaluationContext,
    opts?: { skipRuleUpdate?: boolean }
  ): Promise<RuleExecutionResult> {
    try {
      // 1. Avaliar condições
      const conditionsMet = await this.evaluateConditions(rule.conditions, context)
      if (!conditionsMet) {
        return { ruleId: rule.id.toString(), ruleName: rule.name, executed: false, reason: 'Condições não satisfeitas' }
      }

      // 2. Cooldown por tag no histórico (V1)
      const canExecute = await this.checkCooldown(
        context.user._id,
        (context.course as any)._id as mongoose.Types.ObjectId,
        rule.actions.addTag
      )

      if (!canExecute) {
        return { ruleId: rule.id.toString(), ruleName: rule.name, executed: false, reason: 'Email já enviado recentemente (cooldown)' }
      }

      // 3. Executar ações
      await this.executeRuleActions(rule, context, opts)

      return { ruleId: rule.id.toString(), ruleName: rule.name, executed: true }
    } catch (error: any) {
      return { ruleId: rule.id.toString(), ruleName: rule.name, executed: false, error: error.message }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // AVALIAR CONDIÇÕES
  // ═══════════════════════════════════════════════════════════

  private async evaluateConditions(conditions: ICondition[], context: EvaluationContext): Promise<boolean> {
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

  private evaluateSimpleCondition(condition: ICondition, context: EvaluationContext): boolean {
    const { field, operator, value } = condition
    if (!field || !operator || value === undefined) return false

    const actualValue = this.getFieldValue(field, context)
    if (actualValue === null) return false

    switch (operator) {
      case 'olderThan': return actualValue > value
      case 'newerThan': return actualValue < value
      case 'equals': return actualValue === value
      case 'greaterThan': return actualValue > value
      case 'lessThan': return actualValue < value
      default: return false
    }
  }

  private evaluateCompoundCondition(condition: ICondition, context: EvaluationContext): boolean {
    const { logic, subConditions } = condition
    if (!subConditions || subConditions.length === 0) return false

    const results = subConditions.map(sub => {
      const actualValue = this.getFieldValue(sub.field, context)
      if (actualValue === null) return false

      switch (sub.operator) {
        case 'olderThan': return actualValue > sub.value
        case 'newerThan': return actualValue < sub.value
        case 'equals': return actualValue === sub.value
        case 'greaterThan': return actualValue > sub.value
        case 'lessThan': return actualValue < sub.value
        default: return false
      }
    })

    if (logic === 'AND') return results.every(r => r === true)
    if (logic === 'OR') return results.some(r => r === true)
    return false
  }

  private getFieldValue(field: string, context: EvaluationContext): number | null {
    const { userStats } = context

    switch (field) {
      // Clareza (ACTION_BASED)
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

      // OGI (LOGIN_BASED)
      case 'lastLogin':
      case 'daysSinceLastLogin':
        return userStats.daysSinceLastLogin || 0

      // comuns
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
  // VERIFICAR COOLDOWN (por tag, V1)
  // ═══════════════════════════════════════════════════════════

  private async checkCooldown(
    userId: mongoose.Types.ObjectId,
    courseId: mongoose.Types.ObjectId,
    tagName: string,
    cooldownDays: number = 30
  ): Promise<boolean> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - cooldownDays)

      const recentCommunication = await CommunicationHistory.findOne({
        userId,
        courseId,
        tagApplied: tagName,
        sentAt: { $gte: cutoffDate }
      })

      if (recentCommunication) {
        const daysSince = Math.floor((Date.now() - recentCommunication.sentAt!.getTime()) / (1000 * 60 * 60 * 24))
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
    context: EvaluationContext,
    opts?: { skipRuleUpdate?: boolean }
  ): Promise<void> {
    const { user, course, userStats } = context
    const { addTag, removeTags } = rule.actions

    // 1. Remover tags antigas
    if (removeTags && removeTags.length > 0) {
      console.log(`🗑️ Removendo tags: ${removeTags.join(', ')}`)
      await activeCampaignService.removeTags(user.email, removeTags)
    }

    // 2. Adicionar nova tag
    console.log(`✅ Aplicando tag: ${addTag}`)
    await activeCampaignService.addTag(user.email, addTag)

    // 3. Registar em CommunicationHistory
    await CommunicationHistory.create({
      userId: user._id,
      courseId: (course as any)._id,
      tagRuleId: rule._id,
      tagApplied: addTag,
      status: 'SENT',
      sentAt: new Date(),
      source: 'AUTOMATIC',
      userStateSnapshot: {
        daysSinceLastAction: userStats.daysSinceLastAction,
        currentProgress: userStats.currentProgress,
        currentPhase: 'ENGAGEMENT'
      }
    })

    console.log(`📝 Comunicação registada em histórico`)

    // 4. Atualizar lastRunAt (só se não estivermos em batch)
    if (!opts?.skipRuleUpdate) {
      rule.lastRunAt = new Date()
      await rule.save()
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CALCULAR ESTATÍSTICAS DO USER
  // ═══════════════════════════════════════════════════════════

  private async calculateUserStats(user: any, course: ICourse): Promise<any> {
    const now = new Date()

    const stats: any = {
      daysSinceLastAction: 0,
      currentProgress: user.combined?.totalProgress || 0
    }

    if (course.trackingType === 'ACTION_BASED') {
      const lastAction = await UserAction.findOne({
        userId: user._id,
        courseId: (course as any)._id,
        actionType: course.trackingConfig.actionType
      }).sort({ timestamp: -1 })

      if (lastAction) {
        const diffTime = now.getTime() - lastAction.timestamp.getTime()
        stats.daysSinceLastAction = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      } else {
        stats.daysSinceLastAction = 999
      }

      const lastWeekDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      stats.reportsOpenedLastWeek = await UserAction.countDocuments({
        userId: user._id,
        courseId: (course as any)._id,
        actionType: 'REPORT_OPENED',
        timestamp: { $gte: lastWeekDate }
      })

      const lastMonthDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      stats.reportsOpenedLastMonth = await UserAction.countDocuments({
        userId: user._id,
        courseId: (course as any)._id,
        actionType: 'REPORT_OPENED',
        timestamp: { $gte: lastMonthDate }
      })

      stats.totalReportsOpened = await UserAction.countDocuments({
        userId: user._id,
        courseId: (course as any)._id,
        actionType: 'REPORT_OPENED'
      })
    }

    if (course.trackingType === 'LOGIN_BASED') {
      const lastLoginAction = await UserAction.findOne({
        userId: user._id,
        courseId: (course as any)._id,
        actionType: 'LOGIN'
      }).sort({ timestamp: -1 })

      if (lastLoginAction) {
        const lastLogin = new Date(lastLoginAction.timestamp || lastLoginAction.actionDate)
        stats.lastLogin = lastLogin
        stats.daysSinceLastLogin = Math.floor((now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24))
      } else {
        const userCreated = user.metadata?.createdAt || user.createdAt || now
        stats.daysSinceLastLogin = Math.floor((now.getTime() - userCreated.getTime()) / (1000 * 60 * 60 * 24))
      }

      const communicationData = user.communicationByCourse?.get?.(course.code)
      if (communicationData) {
        stats.currentProgress = communicationData.courseSpecificData?.currentModule || 0
        stats.currentModule = communicationData.courseSpecificData?.currentModule || 0
      } else {
        stats.currentProgress = user.hotmart?.progress?.totalProgress || 0
        stats.currentModule = user.hotmart?.progress?.currentModule || 0
      }
    }

    return stats
  }

  // ═══════════════════════════════════════════════════════════
  // RULE-LEVEL COOLDOWN (best effort) via lastRunAt
  // ═══════════════════════════════════════════════════════════

  private canRuleExecute(rule: ITagRule, cooldownHours: number): boolean {
    if (!rule.lastRunAt) return true
    const hoursSince = (Date.now() - new Date(rule.lastRunAt).getTime()) / (1000 * 60 * 60)
    return hoursSince >= cooldownHours
  }
}

export default new TagRuleEngine()
