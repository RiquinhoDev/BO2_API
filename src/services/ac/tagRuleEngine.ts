// ════════════════════════════════════════════════════════════
// 📁 src/services/ac/tagRuleEngine.ts
// Motor de avaliação e execução de regras de tags
// ✅ SUPORTE UNIFICADO: Hotmart + CursEduca
// ✅ COOLDOWN: 2 dias (sem spam)
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import Course, { ICourse } from '../../models/Course'
import TagRule, { ITagRule, ICondition } from '../../models/acTags/TagRule'
import User from '../../models/user'
import CommunicationHistory from '../../models/acTags/CommunicationHistory'
import activeCampaignService from './activeCampaignService'
import { UserProduct } from '../../models'

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
  rulesExecuted: number
  usersEvaluated: number
  executions: number
  executionTimeMs: number
  errors: Array<{ ruleId: string; ruleName: string; courseId: string; error: string }>
}

// ─────────────────────────────────────────────────────────────
// HELPERS DE UNIFORMIZAÇÃO DE DADOS
// ─────────────────────────────────────────────────────────────

class DataUnifier {
  /**
   * ✅ Detecta a plataforma de origem do user
   */
  static detectPlatform(user: any): 'HOTMART' | 'CURSEDUCA' | 'UNKNOWN' {
    if (user.hotmart && Object.keys(user.hotmart).length > 0) return 'HOTMART'
    if (user.situation || user.tenants) return 'CURSEDUCA'
    return 'UNKNOWN'
  }

  /**
   * ✅ Extrai status uniformizado (ACTIVE/INACTIVE)
   */
  static getUnifiedStatus(user: any): 'ACTIVE' | 'INACTIVE' {
    const platform = this.detectPlatform(user)
    
    if (platform === 'HOTMART') {
      return user.combined?.status || user.hotmart?.status || 'INACTIVE'
    }
    
    if (platform === 'CURSEDUCA') {
      return user.situation === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'
    }
    
    return 'INACTIVE'
  }

  /**
   * ✅ Extrai progresso uniformizado (0-100)
   */
  static getUnifiedProgress(user: any, course: ICourse): number {
    const platform = this.detectPlatform(user)
    
    if (platform === 'HOTMART') {
      return user.combined?.totalProgress || 
             user.hotmart?.progress?.totalProgress || 0
    }
    
    if (platform === 'CURSEDUCA') {
      // CursEDuca pode ter progresso em courseSpecificData
      const communicationData = user.communicationByCourse?.get?.(course.code)
      return communicationData?.courseSpecificData?.totalProgress || 0
    }
    
    return 0
  }

  /**
   * ✅ Extrai módulo atual uniformizado
   */
  static getUnifiedCurrentModule(user: any, course: ICourse): number {
    const platform = this.detectPlatform(user)
    
    if (platform === 'HOTMART') {
      return user.hotmart?.progress?.currentModule || 0
    }
    
    if (platform === 'CURSEDUCA') {
      const communicationData = user.communicationByCourse?.get?.(course.code)
      return communicationData?.courseSpecificData?.currentModule || 0
    }
    
    return 0
  }

  /**
   * ✅ Extrai email uniformizado
   */
  static getUnifiedEmail(user: any): string {
    return user.email || user.hotmart?.email || ''
  }

  /**
   * ✅ Extrai data de criação uniformizada
   */
  static getUnifiedCreatedAt(user: any): Date {
    return user.createdAt || 
           user.metadata?.createdAt || 
           user.hotmart?.createdAt || 
           new Date()
  }
}

// ─────────────────────────────────────────────────────────────
// CLASSE PRINCIPAL
// ─────────────────────────────────────────────────────────────

class TagRuleEngine {
  // ═══════════════════════════════════════════════════════════
  // ✅ EXECUTAR TODAS AS REGRAS ATIVAS (cron global)
  // ═══════════════════════════════════════════════════════════

  async executeAllRules(params?: { ruleCooldownHours?: number }): Promise<ExecutionSummary> {
    const startTime = Date.now()
    const ruleCooldownHours = params?.ruleCooldownHours ?? 1

    const errors: ExecutionSummary['errors'] = []
    let usersEvaluated = 0
    let executions = 0
    const executedRuleIds = new Set<string>()

    console.log('🚀 [TagRuleEngine] Iniciando execução global de regras...')

    const rules = await TagRule.find({ isActive: true }).sort({ priority: -1 })
    const rulesFound = rules.length
    console.log(`📋 [TagRuleEngine] ${rulesFound} regras ativas encontradas`)

    // Agrupar por courseId para otimizar
    const byCourse = new Map<string, ITagRule[]>()
    for (const r of rules) {
      const k = r.courseId.toString()
      if (!byCourse.has(k)) byCourse.set(k, [])
      byCourse.get(k)!.push(r)
    }

    // ✅ QUERY CORRIGIDA: Buscar users ativos de AMBAS as plataformas
    const activeUsers = await User.find({
      $or: [
        { 'combined.status': 'ACTIVE' },      // Hotmart
        { 'situation': 'ACTIVE' }              // CursEDuca
      ]
    })

    console.log(`👥 [TagRuleEngine] ${activeUsers.length} users ativos encontrados`)

    for (const [courseIdStr, courseRules] of byCourse.entries()) {
      const course = await Course.findById(courseIdStr)
      if (!course) {
        console.warn(`⚠️ [TagRuleEngine] Course ${courseIdStr} não encontrado`)
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

      // Filtrar regras com cooldown
      const runnableRules = courseRules.filter(r => this.canRuleExecute(r, ruleCooldownHours))
      if (runnableRules.length === 0) {
        console.log(`⏸️ [TagRuleEngine] Course ${course.code}: todas as regras em cooldown`)
        continue
      }

      console.log(`🔄 [TagRuleEngine] Course ${course.code}: ${runnableRules.length} regras para executar`)

      // Avaliar users para este course
      for (const user of activeUsers) {
        usersEvaluated++

        const platform = DataUnifier.detectPlatform(user)
        const email = DataUnifier.getUnifiedEmail(user)

        console.log(`👤 [TagRuleEngine] Avaliando ${email} (${platform})`)

        let userStats: any
        try {
          userStats = await this.calculateUserStats(user, course)
        } catch (e: any) {
          console.warn(`⚠️ [TagRuleEngine] Stats falharam para ${email}: ${e?.message || e}`)
          continue
        }

        const context: EvaluationContext = { user, course, userStats }

        for (const rule of runnableRules) {
          try {
            // Validar se a regra é compatível com o trackingType do course
            if (!this.validateRuleForCourse(rule, course)) {
              console.warn(`⚠️ [TagRuleEngine] Regra "${rule.name}" incompatível com ${course.trackingType}`)
              continue
            }

            // Avaliar e executar regra (cooldown está dentro do executeRuleActions)
            const result = await this.evaluateAndExecuteRule(rule, context, { skipRuleUpdate: true })
            
            if (result.executed) {
              executions++
              executedRuleIds.add(rule.id.toString())
              console.log(`✅ [TagRuleEngine] Regra "${rule.name}" executada para ${email}`)
            }
          } catch (error: any) {
            console.error(`❌ [TagRuleEngine] Erro ao executar regra "${rule.name}" para ${email}:`, error)
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

    const summary = {
      rulesFound,
      rulesExecuted: executedRuleIds.size,
      usersEvaluated,
      executions,
      executionTimeMs: Date.now() - startTime,
      errors
    }

    console.log('🎉 [TagRuleEngine] Execução global completa:', summary)
    return summary
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ EXECUTAR UMA REGRA MANUALMENTE
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

      // ✅ QUERY CORRIGIDA
      const users = await User.find({
        $or: [
          { 'combined.status': 'ACTIVE' },
          { 'situation': 'ACTIVE' }
        ]
      })

      console.log(`🔄 [TagRuleEngine] Execução manual: regra "${rule.name}", ${users.length} users`)

      let executions = 0
      for (const user of users) {
        const userStats = await this.calculateUserStats(user, course)
        const context: EvaluationContext = { user, course, userStats }

        const res = await this.evaluateAndExecuteRule(rule, context, { skipRuleUpdate: true })
        if (res.executed) executions++
      }

      // marcar lastRunAt 1x
      await TagRule.findByIdAndUpdate(ruleId, { $set: { lastRunAt: new Date() } })

      console.log(`✅ [TagRuleEngine] Execução manual completa: ${executions} execuções`)
      return { success: true, executions }
    } catch (error: any) {
      console.error('❌ [TagRuleEngine] Erro na execução manual:', error)
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

    const user = await User.findById(userId)
    if (!user) throw new Error(`User ${userId} não encontrado`)

    const course = await Course.findById(courseId)
    if (!course) throw new Error(`Course ${courseId} não encontrado`)

    const platform = DataUnifier.detectPlatform(user)
    const email = DataUnifier.getUnifiedEmail(user)

    console.log(`📋 [TagRuleEngine] Avaliando user ${email} (${platform})`)

    const userStats = await this.calculateUserStats(user, course)
    const context: EvaluationContext = { user, course, userStats }

    const rules = await TagRule.find({ courseId, isActive: true }).sort({ priority: -1 })
    console.log(`📋 Avaliando ${rules.length} regras para ${email}`)

    for (const rule of rules) {
      // Validar compatibilidade da regra com o course
      if (!this.validateRuleForCourse(rule, course)) {
        results.push({
          ruleId: rule.id.toString(),
          ruleName: rule.name,
          executed: false,
          reason: `Regra incompatível com trackingType ${course.trackingType}`
        })
        continue
      }

      const result = await this.evaluateAndExecuteRule(rule, context)
      results.push(result)
    }

    console.log(`✅ Avaliação completa para ${email}`)
    return results
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ AVALIAR TODOS OS USERS DE UM CURSO
  // ═══════════════════════════════════════════════════════════

  async evaluateAllUsersInCourse(courseId: mongoose.Types.ObjectId): Promise<void> {
    console.log(`🔄 Iniciando avaliação de todos os users do curso ${courseId}`)

    const course = await Course.findById(courseId)
    if (!course) throw new Error(`Course ${courseId} não encontrado`)

    const rules = await TagRule.find({ courseId, isActive: true }).sort({ priority: -1 })
    console.log(`📋 Course ${course.code}: ${rules.length} regras ativas`)

    // ✅ QUERY CORRIGIDA
    const users = await User.find({
      $or: [
        { 'combined.status': 'ACTIVE' },
        { 'situation': 'ACTIVE' }
      ]
    })
    console.log(`👥 Encontrados ${users.length} users`)

    let successCount = 0
    let errorCount = 0

    for (const user of users) {
      try {
        const platform = DataUnifier.detectPlatform(user)
        const email = DataUnifier.getUnifiedEmail(user)

        console.log(`👤 Avaliando ${email} (${platform})`)

        const userStats = await this.calculateUserStats(user, course)
        const context: EvaluationContext = { user, course, userStats }

        for (const rule of rules) {
          if (!this.validateRuleForCourse(rule, course)) continue
          await this.evaluateAndExecuteRule(rule, context, { skipRuleUpdate: true })
        }

        successCount++
      } catch (error) {
        console.error(`❌ Erro ao avaliar user ${user.email}:`, error)
        errorCount++
      }
    }

    // Atualizar lastRunAt 1x
    await TagRule.updateMany(
      { courseId, isActive: true },
      { $set: { lastRunAt: new Date() } }
    )

    console.log(`✅ Avaliação completa: ${successCount} sucesso, ${errorCount} erros`)
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ VALIDAR SE REGRA É COMPATÍVEL COM O COURSE
  // ═══════════════════════════════════════════════════════════

  private validateRuleForCourse(rule: ITagRule, course: ICourse): boolean {
    const trackingType = course.trackingType

    // Campos válidos por trackingType
    const validFields = {
      ACTION_BASED: [
        'lastAccessDate',
        'lastReportOpenedAt',
        'lastReportOpened',
        'reportsOpenedLastWeek',
        'reportsOpenedLastMonth',
        'totalReportsOpened',
        'currentProgress',
        'currentModule'
      ],
      LOGIN_BASED: [
        'lastLogin',
        'daysSinceLastLogin',
        'currentProgress',
        'currentModule'
      ]
    }

    const allowedFields = validFields[trackingType] || []

    // Verificar se todas as condições usam campos permitidos
    for (const condition of rule.conditions) {
      if (condition.type === 'SIMPLE') {
        if (!condition.field || !allowedFields.includes(condition.field)) {
          return false
        }
      } else if (condition.type === 'COMPOUND' && condition.subConditions) {
        for (const sub of condition.subConditions) {
          if (!sub.field || !allowedFields.includes(sub.field)) {
            return false
          }
        }
      }
    }

    return true
  }

  // ═══════════════════════════════════════════════════════════
  // AVALIAR E EXECUTAR UMA REGRA
  // ✅ COOLDOWN CHECK REMOVIDO DAQUI (está no executeRuleActions)
  // ═══════════════════════════════════════════════════════════

  private async evaluateAndExecuteRule(
    rule: ITagRule,
    context: EvaluationContext,
    opts?: { skipRuleUpdate?: boolean }
  ): Promise<RuleExecutionResult> {
    try {
      const email = DataUnifier.getUnifiedEmail(context.user)

      // 1. Avaliar condições
      const conditionsMet = await this.evaluateConditions(rule.conditions, context)
      if (!conditionsMet) {
        return {
          ruleId: rule.id.toString(),
          ruleName: rule.name,
          executed: false,
          reason: 'Condições não satisfeitas'
        }
      }

      // 2. Executar ações (cooldown check está DENTRO do executeRuleActions!)
      await this.executeRuleActions(rule, context, opts)

      console.log(`✅ Regra "${rule.name}" executada para ${email}`)
      return { 
        ruleId: rule.id.toString(), 
        ruleName: rule.name, 
        executed: true,
        action: 'ADD_TAG'
      }
    } catch (error: any) {
      console.error(`❌ Erro ao executar regra "${rule.name}":`, error)
      return {
        ruleId: rule.id.toString(),
        ruleName: rule.name,
        executed: false,
        error: error.message
      }
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
    if (actualValue === null) {
      console.warn(`⚠️ Campo "${field}" retornou null`)
      return false
    }

    const result = this.compareValues(actualValue, operator, value)
    console.log(`🔍 Condição: ${field} ${operator} ${value} => ${actualValue} = ${result}`)
    
    return result
  }

  private evaluateCompoundCondition(condition: ICondition, context: EvaluationContext): boolean {
    const { logic, subConditions } = condition
    if (!subConditions || subConditions.length === 0) return false

    const results = subConditions.map(sub => {
      const actualValue = this.getFieldValue(sub.field, context)
      if (actualValue === null) return false

      return this.compareValues(actualValue, sub.operator, sub.value)
    })

    if (logic === 'AND') return results.every(r => r === true)
    if (logic === 'OR') return results.some(r => r === true)
    return false
  }

  private compareValues(actualValue: number, operator: string, expectedValue: number): boolean {
    switch (operator) {
      case 'olderThan': return actualValue > expectedValue
      case 'newerThan': return actualValue < expectedValue
      case 'equals': return actualValue === expectedValue
      case 'greaterThan': return actualValue > expectedValue
      case 'lessThan': return actualValue < expectedValue
      default: return false
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ MAPEAMENTO CORRETO DE CAMPOS POR TRACKING TYPE
  // ═══════════════════════════════════════════════════════════

  private getFieldValue(field: string, context: EvaluationContext): number | null {
    const { userStats, course } = context
    const trackingType = course.trackingType

    // ─────────────────────────────────────────────────────────
    // ACTION_BASED (Clareza)
    // ─────────────────────────────────────────────────────────
    if (trackingType === 'ACTION_BASED') {
      switch (field) {
        case 'lastAccessDate':
        case 'lastReportOpenedAt':
        case 'lastReportOpened':
          return userStats.daysSinceLastAction ?? null

        case 'reportsOpenedLastWeek':
          return userStats.reportsOpenedLastWeek ?? 0

        case 'reportsOpenedLastMonth':
          return userStats.reportsOpenedLastMonth ?? 0

        case 'totalReportsOpened':
          return userStats.totalReportsOpened ?? 0

        case 'currentProgress':
          return userStats.currentProgress ?? 0

        case 'currentModule':
          return userStats.currentModule ?? 0

        default:
          console.warn(`⚠️ Campo "${field}" não suportado em ACTION_BASED`)
          return null
      }
    }

    // ─────────────────────────────────────────────────────────
    // LOGIN_BASED (OGI)
    // ─────────────────────────────────────────────────────────
    if (trackingType === 'LOGIN_BASED') {
      switch (field) {
        case 'lastLogin':
        case 'daysSinceLastLogin':
          return userStats.daysSinceLastLogin ?? null

        case 'currentProgress':
          return userStats.currentProgress ?? 0

        case 'currentModule':
          return userStats.currentModule ?? 0

        default:
          console.warn(`⚠️ Campo "${field}" não suportado em LOGIN_BASED`)
          return null
      }
    }

    console.warn(`⚠️ TrackingType "${trackingType}" desconhecido`)
    return null
  }

  // ═══════════════════════════════════════════════════════════
  // VERIFICAR COOLDOWN
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
  // ✅ EXECUTAR AÇÕES DA REGRA (COM COOLDOWN DE 2 DIAS)
  // ═══════════════════════════════════════════════════════════

  private async executeRuleActions(
    rule: ITagRule,
    context: EvaluationContext,
    opts?: { skipRuleUpdate?: boolean }
  ): Promise<void> {
    const { user, course, userStats } = context
    const { addTag, removeTags } = rule.actions

    const email = DataUnifier.getUnifiedEmail(user)

    // ═══════════════════════════════════════════════════════════
    // ✅ COOLDOWN CHECK (2 DIAS - 48 HORAS)
    // Usa sistema existente do CommunicationHistory
    // ═══════════════════════════════════════════════════════════
    
    const COOLDOWN_DAYS = 2  // ← 2 DIAS = 48 HORAS
    
    const canExecute = await this.checkCooldown(
      user._id,
      (course as any)._id,
      addTag,
      COOLDOWN_DAYS  // ← Passa 2 dias em vez do default 30
    )

    if (!canExecute) {
      // Sistema já logou o motivo no checkCooldown
      // Adicionar log adicional para clareza
      console.log(`⏭️  [${email}] Tag "${addTag}" em cooldown (${COOLDOWN_DAYS} dias) - SKIP`)
      return  // ← SKIP! Não aplica tag nem remove nada
    }

    // ═══════════════════════════════════════════════════════════
    // SE NÃO ESTÁ EM COOLDOWN, PROCEDER NORMALMENTE
    // ═══════════════════════════════════════════════════════════

    // 1. Remover tags antigas
    if (removeTags && removeTags.length > 0) {
      console.log(`🗑️ [${email}] Removendo tags: ${removeTags.join(', ')}`)
      await activeCampaignService.removeTags(email, removeTags)
    }

    // 2. Adicionar nova tag
    console.log(`✅ [${email}] Aplicando tag: ${addTag}`)
    await activeCampaignService.addTag(email, addTag)

    // 3. Registar em CommunicationHistory
    const snapshot: any = {
      currentProgress: userStats.currentProgress,
      currentPhase: 'ENGAGEMENT'
    }

    // Adicionar campo específico do trackingType
    if (course.trackingType === 'ACTION_BASED') {
      snapshot.daysSinceLastAction = userStats.daysSinceLastAction
    } else if (course.trackingType === 'LOGIN_BASED') {
      snapshot.daysSinceLastLogin = userStats.daysSinceLastLogin
    }

    await CommunicationHistory.create({
      userId: user._id,
      courseId: (course as any)._id,
      tagRuleId: rule._id,
      tagApplied: addTag,
      status: 'SENT',
      sentAt: new Date(),
      source: 'AUTOMATIC',
      userStateSnapshot: snapshot
    })

    console.log(`📝 [${email}] Comunicação registada em histórico`)

    // 4. Atualizar lastRunAt
    if (!opts?.skipRuleUpdate) {
      rule.lastRunAt = new Date()
      await rule.save()
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ CALCULAR ESTATÍSTICAS DO USER (UNIFORMIZADO)
  // ═══════════════════════════════════════════════════════════

private async calculateUserStats(user: any, course: ICourse): Promise<any> {
  const userProduct = await UserProduct.findOne({ userId: user._id }).lean()

  if (!userProduct) {
    console.warn(`⚠️  [${user.email}] UserProduct não encontrado!`)
    return {
      daysSinceLastAction: 999,
      daysSinceLastLogin: 999,
      reportsOpenedLastWeek: 0,
      reportsOpenedLastMonth: 0,
      totalReportsOpened: 0,
      currentProgress: 0,
      currentModule: 0
    }
  }

  const engagement = (userProduct as any).engagement || {}
  const progress = (userProduct as any).progress || {}

  return {
    // ACTION_BASED (Clareza)
    daysSinceLastAction: engagement.daysSinceLastAction ?? 999,
    reportsOpenedLastWeek: engagement.actionsLastWeek ?? 0,
    reportsOpenedLastMonth: engagement.actionsLastMonth ?? 0,
    totalReportsOpened: engagement.totalActions ?? 0,
    
    // LOGIN_BASED (OGI)
    daysSinceLastLogin: engagement.daysSinceLastLogin ?? 999,
    totalLogins: engagement.totalLogins ?? 0,
    
    // COMUM
    currentProgress: progress.percentage ?? 0,
    currentModule: progress.currentModule ?? 0
  }
}

  // ═══════════════════════════════════════════════════════════
  // RULE-LEVEL COOLDOWN
  // ═══════════════════════════════════════════════════════════

  private canRuleExecute(rule: ITagRule, cooldownHours: number): boolean {
    if (!rule.lastRunAt) return true
    const hoursSince = (Date.now() - new Date(rule.lastRunAt).getTime()) / (1000 * 60 * 60)
    return hoursSince >= cooldownHours
  }
}

export default new TagRuleEngine()