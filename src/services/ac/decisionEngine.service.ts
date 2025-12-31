// =====================================================
// 📁 src/services/ac/decisionEngine.service.ts
// ✅ UNIFICADO: Decision Engine por UserProduct (1 única fonte)
// - Usa TagRules por produto
// - Faz escalonamento (níveis) a partir das regras
// - Cooldown + progresso recente
// - Executa tags via activeCampaignService
// =====================================================

import UserProduct from '../../models/UserProduct'
import Product from '../../models/Product'
import User from '../../models/user'
import TagRule from '../../models/acTags/TagRule'
import UserAction from '../../models/UserAction'
import activeCampaignService from './activeCampaignService'
import Course from '../../models/Course'  // ✅ IMPORT DIRETO (não destructured)
import { adaptTagRuleForDecisionEngine } from './tagRuleAdapter'

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

export type DecisionAction =
  | 'APPLY_TAG'
  | 'REMOVE_TAG'
  | 'ESCALATE'
  | 'DESESCALATE'
  | 'SEND_EMAIL'
  | 'NO_ACTION'

export type DecisionSource = 'LEVEL' | 'TAG_RULE' | 'SYSTEM'

export interface Decision {
  source: DecisionSource
  ruleId?: string
  ruleName: string
  condition?: string
  action: DecisionAction
  tagName?: string
  shouldExecute: boolean
  reason: string
  confidence: number
}

export interface DecisionResult {
  userId: string
  productId: string
  productCode: string

  currentLevel: number
  appropriateLevel: number
  inCooldown: boolean
  cooldownUntil?: Date

  decisions: Decision[]
  tagsToApply: string[]
  tagsToRemove: string[]

  actionsExecuted: number
  errors: string[]

  nextEvaluationDate?: Date
  metadata?: Record<string, any>
}

export interface DecisionContext {
  userId: string
  productId: string
  userProduct: any
  user: any
  product: any
  rules: any[]
}

// ─────────────────────────────────────────────────────────────
// HELPERS (parsing / compat)
// ─────────────────────────────────────────────────────────────

type LevelRule = {
  rule: any
  level: number
  daysInactive: number
  tagName: string
  cooldownDays?: number
}

const DEFAULT_COOLDOWN_DAYS = 3

function nowUTC(): Date {
  return new Date()
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * Tenta extrair um threshold de dias a partir de conditions tipo:
 *  - "daysSinceLastLogin >= 14"
 *  - "daysInactive >= 21"
 */
function extractDaysThreshold(condition?: string): number | null {
  if (!condition) return null

  const normalized = condition.replace(/\s+/g, ' ').trim()

  // Ex: daysSinceLastLogin >= 14
  const m1 = normalized.match(/daysSinceLastLogin\s*>=\s*(\d+)/i)
  if (m1?.[1]) return Number(m1[1])

  // Ex: daysInactive >= 14
  const m2 = normalized.match(/daysInactive\s*>=\s*(\d+)/i)
  if (m2?.[1]) return Number(m2[1])

  return null
}

/**
 * Detecta regras de nível (reengagement levels).
 * Suporta:
 * - rule.level + rule.daysInactive
 * - OU parse do condition (daysSinceLastLogin >= X / daysInactive >= X)
 *
 * Para evitar duplicação, tudo o que for "LevelRule" sai de "rules normais".
 */
function splitRulesIntoLevelAndRegular(rules: any[]): {
  levelRules: LevelRule[]
  regularRules: any[]
} {
  const levelRules: LevelRule[] = []
  const regularRules: any[] = []

  for (const rule of rules) {
    const tagName = rule.tagName || rule.tag || rule.tagAC
    const action = rule.action

    // Só faz sentido como nível se for APPLY_TAG e tiver tagName
    if (action === 'APPLY_TAG' && tagName) {
      const explicitLevel =
        typeof rule.level === 'number' ? rule.level : null
      const explicitDays =
        typeof rule.daysInactive === 'number'
          ? rule.daysInactive
          : typeof rule.daysInactiveThreshold === 'number'
            ? rule.daysInactiveThreshold
            : null

      const parsedDays = extractDaysThreshold(rule.condition)

      // Regra de nível reconhecida se tiver dias (explicito ou parseado)
      const daysInactive = explicitDays ?? parsedDays
      if (typeof daysInactive === 'number' && daysInactive > 0) {
        levelRules.push({
          rule,
          level: explicitLevel ?? -1, // vamos normalizar já a seguir
          daysInactive,
          tagName,
          cooldownDays:
            typeof rule.cooldownDays === 'number' ? rule.cooldownDays : undefined
        })
        continue
      }
    }

    regularRules.push(rule)
  }

  // Normalizar níveis se vierem sem "level"
  // Ordena por daysInactive asc e atribui 1..N se necessário
  levelRules.sort((a, b) => a.daysInactive - b.daysInactive)

  let autoLevel = 1
  for (const lr of levelRules) {
    if (lr.level === -1) {
      lr.level = autoLevel
      autoLevel++
    } else {
      autoLevel = Math.max(autoLevel, lr.level + 1)
    }
  }

  // Ordenar por level asc para lógica
  levelRules.sort((a, b) => a.level - b.level)

  return { levelRules, regularRules }
}

/**
 * Lê cooldown guardado no UserProduct (compatível com vários formatos).
 * Escolhe 1 estrutura e usa-a sempre no update (ver setCooldown()).
 */
function getCooldownUntil(userProduct: any): Date | undefined {
  const raw =
    userProduct?.reengagement?.cooldownUntil ??
    userProduct?.activeCampaignData?.cooldownUntil ??
    userProduct?.cooldownUntil

  if (!raw) return undefined
  const dt = new Date(raw)
  return Number.isNaN(dt.getTime()) ? undefined : dt
}

async function setCooldown(userProductId: string, until?: Date): Promise<void> {
  await UserProduct.findByIdAndUpdate(
    userProductId,
    {
      $set: {
        'reengagement.cooldownUntil': until ?? null
      }
    },
    { new: false }
  )
}

/**
 * Tenta inferir o "currentLevel" via:
 * 1) userProduct.reengagement.currentLevel
 * 2) tags presentes em userProduct.activeCampaignData.tags comparando com levelRules
 */
function inferCurrentLevel(userProduct: any, levelRules: LevelRule[]): number {
  const stored = userProduct?.reengagement?.currentLevel
  if (typeof stored === 'number') return stored

  const tags: string[] = userProduct?.activeCampaignData?.tags || []
  if (!Array.isArray(tags) || tags.length === 0) return 0

  let max = 0
  for (const lr of levelRules) {
    if (tags.includes(lr.tagName)) {
      max = Math.max(max, lr.level)
    }
  }
  return max
}

/**
 * Encontra o "appropriateLevel" pelo maior threshold cumprido.
 */
function determineAppropriateLevel(daysInactive: number, levelRules: LevelRule[]): number {
  let lvl = 0
  for (const lr of levelRules) {
    if (daysInactive >= lr.daysInactive) lvl = lr.level
  }
  return lvl
}

/**
 * Confiança simples (podes sofisticar depois).
 */
function confidenceForLevel(daysInactive: number, lr: LevelRule): number {
  const over = daysInactive - lr.daysInactive
  let c = 70
  if (over >= 5) c += 20
  else if (over >= 2) c += 10
  else if (over >= 0) c += 5
  if (lr.level >= 3) c += 5
  return Math.min(100, c)
}

// ─────────────────────────────────────────────────────────────
// ENGINE
// ─────────────────────────────────────────────────────────────

class DecisionEngine {
  // ───────────────────────────────────────────────────────────
  // PUBLIC API
  // ───────────────────────────────────────────────────────────

  async evaluateUserProduct(userId: string, productId: string): Promise<DecisionResult> {
    const result: DecisionResult = {
      userId,
      productId,
      productCode: '',
      currentLevel: 0,
      appropriateLevel: 0,
      inCooldown: false,
      decisions: [],
      tagsToApply: [],
      tagsToRemove: [],
      actionsExecuted: 0,
      errors: []
    }

    try {
      const context = await this.getContext(userId, productId)
      result.productCode = context.product.code

      const { levelRules, regularRules } = splitRulesIntoLevelAndRegular(context.rules)

console.log(`[DEBUG] levelRules: ${levelRules.length}`)
console.log(`[DEBUG] regularRules: ${regularRules.length}`)
levelRules.forEach(lr => console.log(`   Level ${lr.level}: ${lr.tagName} (>=${lr.daysInactive}d)`))
      // ===== métricas base (preferência: UserProduct.engagement)
      const metrics = await this.getMetrics(context)
      const daysInactive = metrics.daysSinceLastLogin

      // ===== cooldown
      const cooldownUntil = getCooldownUntil(context.userProduct)
      if (cooldownUntil && nowUTC() < cooldownUntil) {
        result.inCooldown = true
        result.cooldownUntil = cooldownUntil
        result.nextEvaluationDate = cooldownUntil
        result.decisions.push({
          source: 'SYSTEM',
          ruleName: 'Cooldown',
          action: 'NO_ACTION',
          shouldExecute: false,
          reason: `Em cooldown até ${cooldownUntil.toISOString()}`,
          confidence: 100
        })
        return result
      }

      // ===== progresso recente (se houver)
      const recentProgress = await this.checkRecentProgress(
        userId,
        context.product.code,
        {
          daysSinceLastLogin: metrics.daysSinceLastLogin,
          daysSinceLastAction: metrics.daysSinceLastAction
        }
      )

      // ===== níveis (escalonamento)
      const currentLevel = inferCurrentLevel(context.userProduct, levelRules)
      const appropriateLevel = determineAppropriateLevel(daysInactive, levelRules)

      result.currentLevel = currentLevel
      result.appropriateLevel = appropriateLevel

      // 1) Se teve progresso recente e está em nível -> desescalar (remover tags de nível)
      if (recentProgress && currentLevel > 0) {
        const levelTags = levelRules.map(lr => lr.tagName)
        result.tagsToRemove.push(...levelTags)

        result.decisions.push({
          source: 'LEVEL',
          ruleName: 'Recent Progress',
          action: 'DESESCALATE',
          shouldExecute: true,
          reason: `Progresso recente detectado: ${recentProgress.type} (${recentProgress.value})`,
          confidence: 95
        })

        // aplica cooldown curto após retorno/progresso
        const until = addDays(nowUTC(), 1)
        await setCooldown(context.userProduct._id.toString(), until)
        result.nextEvaluationDate = until
      } else {
        // 2) Se voltou a ativo (0 dias) e tem nível -> remover tags
        if (daysInactive === 0 && currentLevel > 0) {
          const levelTags = levelRules.map(lr => lr.tagName)
          result.tagsToRemove.push(...levelTags)

          result.decisions.push({
            source: 'LEVEL',
            ruleName: 'Back Active',
            action: 'REMOVE_TAG',
            shouldExecute: true,
            reason: 'Aluno voltou a ser ativo (0 dias inativo)',
            confidence: 100
          })

          const until = addDays(nowUTC(), 1)
          await setCooldown(context.userProduct._id.toString(), until)
          result.nextEvaluationDate = until
        }

        // 3) Se apropriado > atual -> aplicar/escalar para tag do nível apropriado
        if (appropriateLevel > currentLevel && levelRules.length > 0) {
          const target = levelRules.find(lr => lr.level === appropriateLevel)

          if (target) {
            // remover outros níveis antes (evita tags conflitantes)
            const otherLevelTags = levelRules
              .filter(lr => lr.tagName !== target.tagName)
              .map(lr => lr.tagName)

            result.tagsToRemove.push(...otherLevelTags)
            result.tagsToApply.push(target.tagName)

            const action: DecisionAction = currentLevel === 0 ? 'APPLY_TAG' : 'ESCALATE'

            result.decisions.push({
              source: 'LEVEL',
              ruleId: target.rule?._id?.toString?.(),
              ruleName: `Level ${target.level}`,
              condition: target.rule?.condition,
              action,
              tagName: target.tagName,
              shouldExecute: true,
              reason: `${daysInactive} dias inativo → ${action === 'APPLY_TAG' ? 'aplicar' : 'escalar'} para nível ${target.level}`,
              confidence: confidenceForLevel(daysInactive, target)
            })

            // cooldown após escalonamento
            const cdDays = target.cooldownDays ?? DEFAULT_COOLDOWN_DAYS
            const until = addDays(nowUTC(), cdDays)
            await setCooldown(context.userProduct._id.toString(), until)
            result.nextEvaluationDate = until
          }
        }

        // 4) Se apropriado < atual (e queres permitir) -> desescalar
        // (opcional — por omissão só removemos com progresso/ativo)
      }

      // ===== regras "normais" (não-nível)
      for (const rule of regularRules) {
        const decision = await this.evaluateRule(rule, context, metrics)
        result.decisions.push(decision)

  // ✅ ADICIONAR LOG AQUI:
  console.log(`[DEBUG] Regra: ${rule.name}`)
  console.log(`[DEBUG]   Condição: ${rule.condition}`)
  console.log(`[DEBUG]   shouldExecute: ${decision.shouldExecute}`)
  console.log(`[DEBUG]   tagName: ${decision.tagName}`)

        if (decision.shouldExecute && decision.tagName) {
          if (decision.action === 'APPLY_TAG') result.tagsToApply.push(decision.tagName)
          if (decision.action === 'REMOVE_TAG') result.tagsToRemove.push(decision.tagName)
        }
      }

      // ===== resolver conflitos (remove > apply)
      const resolved = this.resolveConflicts(result.tagsToApply, result.tagsToRemove)
      result.tagsToApply = resolved.tagsToApply
      result.tagsToRemove = resolved.tagsToRemove

      // ===== executar
      await this.executeDecisions(result)

      return result
    } catch (error: any) {
      result.errors.push(error?.message || 'Erro desconhecido')
      return result
    }
  }

  async evaluateAllUserProducts(userId: string): Promise<DecisionResult[]> {
    const userProducts = await UserProduct.find({ userId })
    const out: DecisionResult[] = []

    for (const up of userProducts) {
      out.push(await this.evaluateUserProduct(userId, up.productId.toString()))
    }

    return out
  }

  async evaluateAllUsersOfProduct(productId: string): Promise<DecisionResult[]> {
    const userProducts = await UserProduct.find({ productId })
    const out: DecisionResult[] = []

    for (const up of userProducts) {
      out.push(await this.evaluateUserProduct(up.userId.toString(), productId))
    }

    return out
  }

  // ───────────────────────────────────────────────────────────
  // CONTEXT / METRICS
  // ───────────────────────────────────────────────────────────

  private async getContext(userId: string, productId: string): Promise<DecisionContext> {
    const userProduct = await UserProduct.findOne({ userId, productId })
    const user = await User.findById(userId)
    const product = await Product.findById(productId)

    if (!userProduct || !user || !product) {
      throw new Error('UserProduct, User ou Product não encontrado')
    }
  // ✅ ADICIONAR LOGS AQUI:
  console.log('[DEBUG] product.code:', product.code)
  console.log('[DEBUG] product.courseCode:', (product as any).courseCode)
  console.log('[DEBUG] Buscando Course com code:', (product as any).courseCode || product.code)

  const course = await Course.findOne({ 
    code: (product as any).courseCode || product.code 
  })
  
  // ✅ ADICIONAR LOG AQUI:
  console.log('[DEBUG] Course encontrado?', course ? 'SIM' : 'NÃO')
  if (!course) {
    console.log('[DEBUG] Tentando buscar TODOS os courses...')
    const allCourses = await Course.find().limit(5)
    console.log('[DEBUG] Courses na BD:', allCourses.map(c => c.code))
  }
  

    if (!course) {
      throw new Error(`Course não encontrado para product ${product.code}`)
    }
    
    // ✅ BUSCAR REGRAS VIA courseId
const rules = await TagRule.find({
  courseId: course._id,
  isActive: true
}).sort({ priority: -1, name: 1 })

// ✅ ADAPTAR REGRAS PARA FORMATO DO DECISIONENGINE
const adaptedRules = rules.map(r => adaptTagRuleForDecisionEngine(r))

console.log('[DEBUG] TagRules adaptadas:', adaptedRules.length)
if (adaptedRules.length > 0) {
  console.log('[DEBUG] Primeira regra adaptada:', {
    name: adaptedRules[0].name,
    tagName: adaptedRules[0].tagName,
    action: adaptedRules[0].action,
    condition: adaptedRules[0].condition
  })
}

    return { userId, productId, userProduct, user, product, rules: adaptedRules }
  }

  private async getMetrics(context: DecisionContext): Promise<{
    daysSinceLastLogin: number
    daysSinceLastAction: number
    engagementScore: number
    totalLogins: number
    totalActions: number
  }> {
    const up = context.userProduct

    // Preferir métricas já calculadas no UserProduct
    const fallback = {
      daysSinceLastLogin: 999,
      daysSinceLastAction: 999,
      engagementScore: 0,
      totalLogins: 0,
      totalActions: 0
    }

    const m = up?.engagement
    if (m) {
      return {
        daysSinceLastLogin: m.daysSinceLastLogin ?? fallback.daysSinceLastLogin,
        daysSinceLastAction: m.daysSinceLastAction ?? fallback.daysSinceLastAction,
        engagementScore: m.engagementScore ?? fallback.engagementScore,
        totalLogins: m.totalLogins ?? fallback.totalLogins,
        totalActions: m.totalActions ?? fallback.totalActions
      }
    }

    // Fallback: tentar inferir via User (última atividade)
    const last = this.getLastActivityDate(context.user, context.product.code)
    const days = this.calculateDaysInactive(last)

    return {
      ...fallback,
      daysSinceLastLogin: days,
      daysSinceLastAction: days
    }
  }

  private getLastActivityDate(user: any, productCode: string): Date {
    const courseData = user.communicationByCourse?.get?.(productCode)
    if (courseData?.lastActivityDate) return new Date(courseData.lastActivityDate)
    if (user.lastLogin) return new Date(user.lastLogin)
    return new Date(user.createdAt || Date.now())
  }

  private calculateDaysInactive(lastActivity: Date): number {
    const diffMs = Date.now() - lastActivity.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    return Math.max(0, diffDays)
  }

  // ───────────────────────────────────────────────────────────
  // RULE EVAL
  // ───────────────────────────────────────────────────────────

  private async evaluateRule(rule: any, context: DecisionContext, metrics: any): Promise<Decision> {
    const decision: Decision = {
      source: 'TAG_RULE',
      ruleId: rule._id?.toString?.(),
      ruleName: rule.name,
      condition: rule.condition,
      action: rule.action,
      tagName: rule.tagName,
      shouldExecute: false,
      reason: '',
      confidence: 80
    }

    try {
      const ok = await this.evaluateCondition(rule.condition, context, metrics)

      if (ok) {
        decision.shouldExecute = true
        decision.reason = 'Condição satisfeita'
      } else {
        decision.reason = 'Condição não satisfeita'
      }

      return decision
    } catch (error: any) {
      decision.shouldExecute = false
      decision.reason = `Erro ao avaliar: ${error.message}`
      decision.confidence = 0
      return decision
    }
  }

  /**
   * Avaliação simples (mantém o teu estilo atual)
   * Se quiseres, trocamos depois por evaluator seguro (expr-eval / jexl, etc).
   */
private async evaluateCondition(condition: string, context: DecisionContext, metrics: any): Promise<boolean> {
  if (!condition) return false

  const daysSinceLastLogin = metrics.daysSinceLastLogin
  const daysSinceLastAction = metrics.daysSinceLastAction
  const engagementScore = metrics.engagementScore
  const totalLogins = metrics.totalLogins
  const totalActions = metrics.totalActions

  // ═══════════════════════════════════════════════════════════
  // PRIORIDADE 1: CONDIÇÕES COMPOSTAS (AND) - PROCESSAR PRIMEIRO!
  // ═══════════════════════════════════════════════════════════
  if (/\sAND\s/i.test(condition)) {
    const parts = condition.split(/\sAND\s/i).map(p => p.trim().replace(/[()]/g, ''))
    
    const results = parts.map(part => {
      // daysSinceLastLogin >= X
      if (/daysSinceLastLogin\s*>=\s*(\d+)/i.test(part)) {
        const m = part.match(/(\d+)/)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceLastLogin >= threshold
        console.log(`   [EVAL] daysSinceLastLogin >= ${threshold}: ${daysSinceLastLogin} >= ${threshold} = ${result}`)
        return result
      }
      // daysSinceLastLogin < X
      if (/daysSinceLastLogin\s*<\s*(\d+)/i.test(part)) {
        const m = part.match(/(\d+)/)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceLastLogin < threshold
        console.log(`   [EVAL] daysSinceLastLogin < ${threshold}: ${daysSinceLastLogin} < ${threshold} = ${result}`)
        return result
      }
      // currentProgress >= X
      if (/currentProgress\s*>=\s*(\d+)/i.test(part)) {
        const m = part.match(/(\d+)/)
        const threshold = Number(m?.[1] || 0)
        const current = context.userProduct?.progress?.percentage || 0
        const result = current >= threshold
        console.log(`   [EVAL] currentProgress >= ${threshold}: ${current} >= ${threshold} = ${result}`)
        return result
      }
      // currentProgress > X
      if (/currentProgress\s*>\s*(\d+)/i.test(part)) {
        const m = part.match(/(\d+)/)
        const threshold = Number(m?.[1] || 0)
        const current = context.userProduct?.progress?.percentage || 0
        const result = current > threshold
        console.log(`   [EVAL] currentProgress > ${threshold}: ${current} > ${threshold} = ${result}`)
        return result
      }
      // currentProgress < X
      if (/currentProgress\s*<\s*(\d+)/i.test(part)) {
        const m = part.match(/(\d+)/)
        const threshold = Number(m?.[1] || 0)
        const current = context.userProduct?.progress?.percentage || 0
        const result = current < threshold
        console.log(`   [EVAL] currentProgress < ${threshold}: ${current} < ${threshold} = ${result}`)
        return result
      }
      console.log(`   [EVAL] Part não reconhecida: ${part}`)
      return false
    })
    
    const finalResult = results.every(r => r === true)
    console.log(`   [EVAL AND] Resultado final: ${finalResult} (${results.filter(r => r).length}/${results.length} condições true)`)
    return finalResult
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORIDADE 2: CONDIÇÕES SIMPLES
  // ═══════════════════════════════════════════════════════════

  // daysInactive (alias de daysSinceLastLogin)
  if (/daysInactive\s*>=/i.test(condition)) {
    const threshold = extractDaysThreshold(condition) ?? 0
    const result = daysSinceLastLogin >= threshold
    console.log(`   [EVAL] daysInactive >= ${threshold}: ${daysSinceLastLogin} >= ${threshold} = ${result}`)
    return result
  }

  // daysSinceLastLogin >=
  if (/daysSinceLastLogin\s*>=/i.test(condition)) {
    const threshold = extractDaysThreshold(condition) ?? 0
    const result = daysSinceLastLogin >= threshold
    console.log(`   [EVAL] daysSinceLastLogin >= ${threshold}: ${daysSinceLastLogin} >= ${threshold} = ${result}`)
    return result
  }

  // daysSinceLastLogin 
  if (/daysSinceLastLogin\s*</i.test(condition)) {
    const m = condition.match(/daysSinceLastLogin\s*<\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastLogin < threshold
    console.log(`   [EVAL] daysSinceLastLogin < ${threshold}: ${daysSinceLastLogin} < ${threshold} = ${result}`)
    return result
  }

  // daysSinceLastAction >=
  if (/daysSinceLastAction\s*>=/i.test(condition)) {
    const m = condition.match(/(\d+)/)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastAction >= threshold
    console.log(`   [EVAL] daysSinceLastAction >= ${threshold}: ${daysSinceLastAction} >= ${threshold} = ${result}`)
    return result
  }

  // engagementScore 
  if (/engagementScore\s*</i.test(condition)) {
    const m = condition.match(/(\d+)/)
    const threshold = Number(m?.[1] || 0)
    const result = engagementScore < threshold
    console.log(`   [EVAL] engagementScore < ${threshold}: ${engagementScore} < ${threshold} = ${result}`)
    return result
  }

  // totalLogins >=
  if (/totalLogins\s*>=/i.test(condition)) {
    const m = condition.match(/(\d+)/)
    const threshold = Number(m?.[1] || 0)
    const result = totalLogins >= threshold
    console.log(`   [EVAL] totalLogins >= ${threshold}: ${totalLogins} >= ${threshold} = ${result}`)
    return result
  }

  // totalActions >=
  if (/totalActions\s*>=/i.test(condition)) {
    const m = condition.match(/(\d+)/)
    const threshold = Number(m?.[1] || 0)
    const result = totalActions >= threshold
    console.log(`   [EVAL] totalActions >= ${threshold}: ${totalActions} >= ${threshold} = ${result}`)
    return result
  }

  // currentProgress ===
  if (/currentProgress\s*===\s*(\d+)/i.test(condition)) {
    const m = condition.match(/currentProgress\s*===\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const current = context.userProduct?.progress?.percentage || 0
    const result = current === threshold
    console.log(`   [EVAL] currentProgress === ${threshold}: ${current} === ${threshold} = ${result}`)
    return result
  }

  // currentProgress >=
  if (/currentProgress\s*>=\s*(\d+)/i.test(condition)) {
    const m = condition.match(/currentProgress\s*>=\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const current = context.userProduct?.progress?.percentage || 0
    const result = current >= threshold
    console.log(`   [EVAL] currentProgress >= ${threshold}: ${current} >= ${threshold} = ${result}`)
    return result
  }

  // currentProgress >
  if (/currentProgress\s*>\s*(\d+)/i.test(condition)) {
    const m = condition.match(/currentProgress\s*>\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const current = context.userProduct?.progress?.percentage || 0
    const result = current > threshold
    console.log(`   [EVAL] currentProgress > ${threshold}: ${current} > ${threshold} = ${result}`)
    return result
  }

  // currentProgress 
  if (/currentProgress\s*</i.test(condition)) {
    const m = condition.match(/currentProgress\s*<\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const current = context.userProduct?.progress?.percentage || 0
    const result = current < threshold
    console.log(`   [EVAL] currentProgress < ${threshold}: ${current} < ${threshold} = ${result}`)
    return result
  }

  // currentModule ===
  if (/currentModule\s*===\s*(\d+)/i.test(condition)) {
    const m = condition.match(/currentModule\s*===\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const current = context.userProduct?.progress?.currentModule || 0
    const result = current === threshold
    console.log(`   [EVAL] currentModule === ${threshold}: ${current} === ${threshold} = ${result}`)
    return result
  }

  // currentModule >=
  if (/currentModule\s*>=\s*(\d+)/i.test(condition)) {
    const m = condition.match(/currentModule\s*>=\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const current = context.userProduct?.progress?.currentModule || 0
    const result = current >= threshold
    console.log(`   [EVAL] currentModule >= ${threshold}: ${current} >= ${threshold} = ${result}`)
    return result
  }

  // Condição não reconhecida
  console.warn(`[DecisionEngine] ⚠️ Condição não reconhecida: ${condition}`)
  return false
}

  // ───────────────────────────────────────────────────────────
  // PROGRESS
  // ───────────────────────────────────────────────────────────

  private async checkRecentProgress(
    userId: string,
    productCode: string,
    metrics: { daysSinceLastLogin: number; daysSinceLastAction: number }
  ): Promise<{ type: string; value: number } | null> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // ✅ Shortcut: se "dias desde login" é 0, então houve atividade recente
    if (metrics.daysSinceLastLogin === 0) {
      return { type: 'recent_login_metric', value: 1 }
    }

    // ✅ Shortcut opcional: se "dias desde ação" é 0
    if (metrics.daysSinceLastAction === 0) {
      return { type: 'recent_action_metric', value: 1 }
    }

    // ✅ Fonte forte: ações nas últimas 24h
    const actions = await UserAction.find({
      userId,
      productCode: productCode.toUpperCase(),
      createdAt: { $gte: since }
    }).select('_id') // reduz payload

    if (actions.length > 0) {
      return { type: 'user_action', value: actions.length }
    }

    return null
  }

  // ───────────────────────────────────────────────────────────
  // CONFLICTS + EXECUTION
  // ───────────────────────────────────────────────────────────

  private resolveConflicts(tagsToApply: string[], tagsToRemove: string[]) {
    const removeSet = new Set(tagsToRemove)
    const applySet = new Set(tagsToApply)

    // Se algo está em remove e apply, remove ganha
    for (const t of removeSet) {
      if (applySet.has(t)) applySet.delete(t)
    }

    return {
      tagsToApply: Array.from(applySet),
      tagsToRemove: Array.from(removeSet)
    }
  }

  private async executeDecisions(result: DecisionResult): Promise<void> {
    // Remover tags primeiro
    for (const tag of result.tagsToRemove) {
      try {
        await activeCampaignService.removeTagFromUserProduct(
          result.userId,
          result.productId,
          tag
        )
        result.actionsExecuted++
      } catch (error: any) {
        result.errors.push(`Erro ao remover tag ${tag}: ${error.message}`)
      }
    }

    // Aplicar tags depois
    for (const tag of result.tagsToApply) {
      try {
        await activeCampaignService.applyTagToUserProduct(
          result.userId,
          result.productId,
          tag
        )
        result.actionsExecuted++
      } catch (error: any) {
        result.errors.push(`Erro ao aplicar tag ${tag}: ${error.message}`)
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORT SINGLETON
// ─────────────────────────────────────────────────────────────

export const decisionEngine = new DecisionEngine()
export default decisionEngine