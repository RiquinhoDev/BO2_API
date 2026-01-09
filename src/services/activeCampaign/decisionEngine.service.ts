// =====================================================
// 📁 src/services/ac/decisionEngine.service.ts
// ✅ UNIFICADO: Decision Engine por UserProduct (1 única fonte)
// - Usa TagRules por produto
// - Faz escalonamento (níveis) a partir das regras
// - Cooldown + progresso recente
// - Executa tags via activeCampaignService
// =====================================================

import UserProduct from '../../models/UserProduct'
import Product from '../../models/product/Product'
import User from '../../models/user'
import TagRule from '../../models/acTags/TagRule'
import UserAction from '../../models/UserAction'
import activeCampaignService from './activeCampaignService'
import { Course } from '../../models'

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

async evaluateUserProduct(userId: string, productId: string,): Promise<DecisionResult> {
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

  // ✅ ADICIONAR ESTE BLOCO LOGO APÓS O BLOCO ACIMA:

          // 3.5) Se apropriado == atual e apropriado > 0 → MANTER tag atual
          else if (appropriateLevel === currentLevel && appropriateLevel > 0) {
            const target = levelRules.find(lr => lr.level === currentLevel)
            
            if (target) {
              // IMPORTANTE: Adicionar a tag atual a tagsToApply para evitar remoção
              result.tagsToApply.push(target.tagName)
              
              // Remover outras tags de nível (caso existam por engano)
              const otherLevelTags = levelRules
                .filter(lr => lr.tagName !== target.tagName)
                .map(lr => lr.tagName)
              
              if (otherLevelTags.length > 0) {
                result.tagsToRemove.push(...otherLevelTags)
              }

              result.decisions.push({
                source: 'LEVEL',
                ruleId: target.rule?._id?.toString?.(),
                ruleName: `Maintain Level ${currentLevel}`,
                condition: target.rule?.condition,
                action: 'NO_ACTION',
                tagName: target.tagName,
                shouldExecute: false,
                reason: `User mantém nível ${currentLevel} (${daysInactive} dias inativo)`,
                confidence: 100
              })
            }
          }
          // 4) Se apropriado < atual (e queres permitir) -> desescalar
          // (opcional — por omissão só removemos com progresso/ativo)
        }

        // ===== regras "normais" (não-nível)
        for (const rule of regularRules) {
          const decision = await this.evaluateRule(rule, context, metrics)
          result.decisions.push(decision)

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

    const course = await Course.findOne({
      code: (product as any).courseCode || product.code
    })

      if (!course) {
        throw new Error(`Course não encontrado para product ${product.code}`)
      }
      
      // ✅ BUSCAR REGRAS VIA courseId
  const rules = await TagRule.find({
    courseId: course._id,
    isActive: true
  }).sort({ priority: -1, name: 1 })

  // ✅ CONVERTER TagRules para formato interno (sem adapter externo)
  const adaptedRules = rules.map((tagRule: any) => {
    // Converter conditions para string (se necessário)
    let conditionStr = tagRule.condition

    if (!conditionStr && tagRule.conditions && Array.isArray(tagRule.conditions)) {
      // Converter array de conditions para string simples
      const opMap: Record<string, string> = {
        'greaterThan': '>=',
        'lessThan': '<',
        'equals': '===',
        'olderThan': '>=',
        'newerThan': '<'
      }

      const parts = tagRule.conditions.map((cond: any) => {
        if (cond.type === 'SIMPLE') {
          const op = opMap[cond.operator] || cond.operator
          return `${cond.field} ${op} ${cond.value}`
        } else if (cond.type === 'COMPOUND' && cond.subConditions && Array.isArray(cond.subConditions)) {
          // Processar subConditions e combiná-las com logic (AND/OR)
          const subParts = cond.subConditions.map((sub: any) => {
            const op = opMap[sub.operator] || sub.operator
            return `${sub.field} ${op} ${sub.value}`
          }).filter(Boolean)

          if (subParts.length > 0) {
            const logicOp = cond.logic === 'OR' ? '||' : '&&'
            return subParts.length === 1 ? subParts[0] : `(${subParts.join(` ${logicOp} `)})`
          }
        }
        return ''
      }).filter(Boolean)

      conditionStr = parts.join(' AND ')
    }

    const tagName = tagRule.actions?.addTag || ''

    // Extrair daysInactive das conditions (se houver)
    let daysInactive: number | undefined
    if (tagRule.conditions && Array.isArray(tagRule.conditions)) {
      for (const cond of tagRule.conditions) {
        if (cond.type === 'SIMPLE' &&
            (cond.field === 'daysSinceLastLogin' || cond.field === 'daysInactive') &&
            cond.operator === 'greaterThan') {
          daysInactive = cond.value
          break
        } else if (cond.type === 'COMPOUND' && cond.subConditions) {
          // Procurar em subConditions
          for (const sub of cond.subConditions) {
            if ((sub.field === 'daysSinceLastLogin' || sub.field === 'daysInactive') &&
                sub.operator === 'greaterThan') {
              daysInactive = sub.value
              break
            }
          }
          if (daysInactive) break
        }
      }
    }

    return {
      _id: tagRule._id,
      name: tagRule.name,
      tagName,
      action: 'APPLY_TAG',
      condition: conditionStr,
      priority: tagRule.priority || 0,
      daysInactive,
      _original: tagRule
    }
  })

    return { userId, productId, userProduct, user, product, rules: adaptedRules }
  }

private async getMetrics(context: DecisionContext): Promise<{
  daysSinceLastLogin: number
  daysSinceLastAction: number
  daysSinceEnrollment: number  // 🆕 ADICIONADO!
  engagementScore: number
  totalLogins: number
  totalActions: number
}> {
  const up = context.userProduct

  // Preferir métricas já calculadas no UserProduct.engagement
  const fallback = {
    daysSinceLastLogin: 999,
    daysSinceLastAction: 999,
    daysSinceEnrollment: 999,  // 🆕 ADICIONADO!
    engagementScore: 0,
    totalLogins: 0,
    totalActions: 0
  }

  const m = up?.engagement
  
  // 🔧 FIX: LER DIRETAMENTE DO ENGAGEMENT (SEMPRE!)
  if (m) {
    return {
      daysSinceLastLogin: m.daysSinceLastLogin ?? fallback.daysSinceLastLogin,
      daysSinceLastAction: m.daysSinceLastAction ?? fallback.daysSinceLastAction,
      daysSinceEnrollment: m.daysSinceEnrollment ?? fallback.daysSinceEnrollment,  // 🆕 NOVA LINHA!
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
    // daysSinceEnrollment mantém fallback 999 se não houver engagement
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
/**
 * 
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * 🛡️ EVALUATECONDITION - VERSÃO COMPLETA E À PROVA DE BALA
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * SUPORTA:
 * - OGI (LOGIN_BASED): daysSinceLastLogin, currentProgress, currentModule
 * - CLAREZA (ACTION_BASED): lastAccessDate, daysSinceLastAction
 * - Condições compostas (AND)
 * - Condições simples
 * - Todos os operadores: >=, >, <, ===
 * 
 * ORDEM DE PROCESSAMENTO:
 * 1. CONDIÇÕES COMPOSTAS (AND) - Tem prioridade!
 * 2. CONDIÇÕES SIMPLES
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

private async evaluateCondition(
  condition: string,
  context: DecisionContext,
  metrics: any
): Promise<boolean> {
  if (!condition) return false

  // ───────────────────────────────────────────────────────────
  // EXTRAIR MÉTRICAS (✅ INCLUINDO daysSinceEnrollment)
  // ───────────────────────────────────────────────────────────
  const daysSinceLastLogin = metrics.daysSinceLastLogin ?? 999
  const daysSinceLastAction = metrics.daysSinceLastAction ?? 999
  const daysSinceEnrollment = metrics.daysSinceEnrollment ?? 999  // 🆕 NOVO!
  const engagementScore = metrics.engagementScore ?? 0
  const totalLogins = metrics.totalLogins ?? 0
  const totalActions = metrics.totalActions ?? 0
  const currentProgress = context.userProduct?.progress?.percentage ?? 0
  const currentModule = context.userProduct?.progress?.currentModule ?? 0

  // ═══════════════════════════════════════════════════════════
  // 🆕 PRIORIDADE 0: CONDIÇÕES COMPOUND COM && E || (OPERADORES LÓGICOS)
  // ═══════════════════════════════════════════════════════════
  // Remover parênteses externos para facilitar o parsing
  const trimmedCondition = condition.trim().replace(/^\(|\)$/g, '')

  // Suporte para && (AND lógico)
  if (trimmedCondition.includes('&&')) {
    const parts = trimmedCondition.split('&&').map(p => p.trim())
    const results = await Promise.all(
      parts.map(part => this.evaluateCondition(part, context, metrics))
    )
    return results.every(r => r === true)
  }

  // Suporte para || (OR lógico)
  if (trimmedCondition.includes('||')) {
    const parts = trimmedCondition.split('||').map(p => p.trim())
    const results = await Promise.all(
      parts.map(part => this.evaluateCondition(part, context, metrics))
    )
    return results.some(r => r === true)
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORIDADE 1: CONDIÇÕES COMPOSTAS (AND) - Mantém compatibilidade
  // ═══════════════════════════════════════════════════════════
  if (/\sAND\s/i.test(condition)) {
    const parts = condition.split(/\sAND\s/i).map(p => p.trim().replace(/[()]/g, ''))
    
    const results = parts.map(part => {
      // ─────────────────────────────────────────────────────────
      // BLOCO 1: daysSinceLastLogin (OGI)
      // ─────────────────────────────────────────────────────────
      
      if (/daysSinceLastLogin\s*>=\s*(\d+)/i.test(part)) {
        const m = part.match(/daysSinceLastLogin\s*>=\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceLastLogin >= threshold
        return result
      }
      
      if (/daysSinceLastLogin\s*>\s*(\d+)/i.test(part)) {
        const m = part.match(/daysSinceLastLogin\s*>\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceLastLogin > threshold
        return result
      }
      
      if (/daysSinceLastLogin\s*<\s*(\d+)/i.test(part)) {
        const m = part.match(/daysSinceLastLogin\s*<\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceLastLogin < threshold
        return result
      }
      
      if (/daysSinceLastLogin\s*===\s*(\d+)/i.test(part)) {
        const m = part.match(/daysSinceLastLogin\s*===\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceLastLogin === threshold
        return result
      }

      // ─────────────────────────────────────────────────────────
      // BLOCO 2: lastAccessDate (CLAREZA - mapeia para daysSinceLastAction)
      // ─────────────────────────────────────────────────────────
      
      if (/lastAccessDate\s*>=\s*(\d+)/i.test(part)) {
        const m = part.match(/lastAccessDate\s*>=\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceLastAction >= threshold
        return result
      }
      
      if (/lastAccessDate\s*>\s*(\d+)/i.test(part)) {
        const m = part.match(/lastAccessDate\s*>\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceLastAction > threshold
        return result
      }
      
      if (/lastAccessDate\s*<\s*(\d+)/i.test(part)) {
        const m = part.match(/lastAccessDate\s*<\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceLastAction < threshold
        return result
      }
      
      if (/lastAccessDate\s*===\s*(\d+)/i.test(part)) {
        const m = part.match(/lastAccessDate\s*===\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceLastAction === threshold
        return result
      }

      // ─────────────────────────────────────────────────────────
      // BLOCO 3: daysSinceLastAction (CLAREZA)
      // ─────────────────────────────────────────────────────────
      
      if (/daysSinceLastAction\s*>=\s*(\d+)/i.test(part)) {
        const m = part.match(/daysSinceLastAction\s*>=\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceLastAction >= threshold
        return result
      }
      
      if (/daysSinceLastAction\s*>\s*(\d+)/i.test(part)) {
        const m = part.match(/daysSinceLastAction\s*>\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceLastAction > threshold
        return result
      }
      
      if (/daysSinceLastAction\s*<\s*(\d+)/i.test(part)) {
        const m = part.match(/daysSinceLastAction\s*<\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceLastAction < threshold
        return result
      }
      
      if (/daysSinceLastAction\s*===\s*(\d+)/i.test(part)) {
        const m = part.match(/daysSinceLastAction\s*===\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceLastAction === threshold
        return result
      }

      // ─────────────────────────────────────────────────────────
      // 🆕 BLOCO 4: daysSinceEnrollment (CLAREZA - NOVO!)
      // ─────────────────────────────────────────────────────────
      
      if (/daysSinceEnrollment\s*>=\s*(\d+)/i.test(part)) {
        const m = part.match(/daysSinceEnrollment\s*>=\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceEnrollment >= threshold
        return result
      }
      
      if (/daysSinceEnrollment\s*>\s*(\d+)/i.test(part)) {
        const m = part.match(/daysSinceEnrollment\s*>\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceEnrollment > threshold
        return result
      }
      
      if (/daysSinceEnrollment\s*<\s*(\d+)/i.test(part)) {
        const m = part.match(/daysSinceEnrollment\s*<\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceEnrollment < threshold
        return result
      }
      
      if (/daysSinceEnrollment\s*===\s*(\d+)/i.test(part)) {
        const m = part.match(/daysSinceEnrollment\s*===\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = daysSinceEnrollment === threshold
        return result
      }

      // ─────────────────────────────────────────────────────────
      // BLOCO 5: currentProgress (OGI + CLAREZA)
      // ─────────────────────────────────────────────────────────
      
      if (/currentProgress\s*>=\s*(\d+)/i.test(part)) {
        const m = part.match(/currentProgress\s*>=\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = currentProgress >= threshold
        return result
      }
      
      if (/currentProgress\s*>\s*(\d+)/i.test(part)) {
        const m = part.match(/currentProgress\s*>\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = currentProgress > threshold
        return result
      }
      
      if (/currentProgress\s*<\s*(\d+)/i.test(part)) {
        const m = part.match(/currentProgress\s*<\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = currentProgress < threshold
        return result
      }
      
      if (/currentProgress\s*===\s*(\d+)/i.test(part)) {
        const m = part.match(/currentProgress\s*===\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = currentProgress === threshold
        return result
      }

      // ─────────────────────────────────────────────────────────
      // BLOCO 6: currentModule (OGI)
      // ─────────────────────────────────────────────────────────
      
      if (/currentModule\s*>=\s*(\d+)/i.test(part)) {
        const m = part.match(/currentModule\s*>=\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = currentModule >= threshold
        return result
      }
      
      if (/currentModule\s*>\s*(\d+)/i.test(part)) {
        const m = part.match(/currentModule\s*>\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = currentModule > threshold
        return result
      }
      
      if (/currentModule\s*<\s*(\d+)/i.test(part)) {
        const m = part.match(/currentModule\s*<\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = currentModule < threshold
        return result
      }
      
      if (/currentModule\s*===\s*(\d+)/i.test(part)) {
        const m = part.match(/currentModule\s*===\s*(\d+)/i)
        const threshold = Number(m?.[1] || 0)
        const result = currentModule === threshold
        return result
      }

      // ─────────────────────────────────────────────────────────
      // FALLBACK: Part não reconhecida
      // ─────────────────────────────────────────────────────────
      return false
    })
    
    return results.every(r => r === true)
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORIDADE 2: CONDIÇÕES SIMPLES
  // ═══════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // BLOCO 1: daysInactive (alias de daysSinceLastLogin)
  // ─────────────────────────────────────────────────────────
  
  if (/^daysInactive\s*>=\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysInactive\s*>=\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastLogin >= threshold
    return result
  }
  
  if (/^daysInactive\s*>\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysInactive\s*>\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastLogin > threshold
    return result
  }
  
  if (/^daysInactive\s*<\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysInactive\s*<\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastLogin < threshold
    return result
  }

  // ─────────────────────────────────────────────────────────
  // BLOCO 2: daysSinceLastLogin (OGI)
  // ─────────────────────────────────────────────────────────
  
  if (/^daysSinceLastLogin\s*>=\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysSinceLastLogin\s*>=\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastLogin >= threshold
    return result
  }
  
  if (/^daysSinceLastLogin\s*>\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysSinceLastLogin\s*>\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastLogin > threshold
    return result
  }
  
  if (/^daysSinceLastLogin\s*<\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysSinceLastLogin\s*<\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastLogin < threshold
    return result
  }
  
  if (/^daysSinceLastLogin\s*===\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysSinceLastLogin\s*===\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastLogin === threshold
    return result
  }

  // ─────────────────────────────────────────────────────────
  // BLOCO 3: lastAccessDate (CLAREZA)
  // ─────────────────────────────────────────────────────────
  
  if (/^lastAccessDate\s*>=\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/lastAccessDate\s*>=\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastAction >= threshold
    return result
  }
  
  if (/^lastAccessDate\s*>\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/lastAccessDate\s*>\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastAction > threshold
    return result
  }
  
  if (/^lastAccessDate\s*<\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/lastAccessDate\s*<\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastAction < threshold
    return result
  }
  
  if (/^lastAccessDate\s*===\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/lastAccessDate\s*===\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastAction === threshold
    return result
  }

  // ─────────────────────────────────────────────────────────
  // BLOCO 4: daysSinceLastAction (CLAREZA)
  // ─────────────────────────────────────────────────────────
  
  if (/^daysSinceLastAction\s*>=\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysSinceLastAction\s*>=\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastAction >= threshold
    return result
  }
  
  if (/^daysSinceLastAction\s*>\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysSinceLastAction\s*>\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastAction > threshold
    return result
  }
  
  if (/^daysSinceLastAction\s*<\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysSinceLastAction\s*<\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastAction < threshold
    return result
  }
  
  if (/^daysSinceLastAction\s*===\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysSinceLastAction\s*===\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceLastAction === threshold
    return result
  }

  // ─────────────────────────────────────────────────────────
  // 🆕 BLOCO 5: daysSinceEnrollment (CLAREZA - NOVO!)
  // ─────────────────────────────────────────────────────────
  
  if (/^daysSinceEnrollment\s*>=\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysSinceEnrollment\s*>=\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceEnrollment >= threshold
    return result
  }
  
  if (/^daysSinceEnrollment\s*>\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysSinceEnrollment\s*>\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceEnrollment > threshold
    return result
  }
  
  if (/^daysSinceEnrollment\s*<\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysSinceEnrollment\s*<\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceEnrollment < threshold
    return result
  }
  
  if (/^daysSinceEnrollment\s*===\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/daysSinceEnrollment\s*===\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = daysSinceEnrollment === threshold
    return result
  }

  // ─────────────────────────────────────────────────────────
  // BLOCO 6: currentProgress
  // ─────────────────────────────────────────────────────────
  
  if (/^currentProgress\s*===\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/currentProgress\s*===\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = currentProgress === threshold
    return result
  }
  
  if (/^currentProgress\s*>=\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/currentProgress\s*>=\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = currentProgress >= threshold
    return result
  }
  
  if (/^currentProgress\s*>\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/currentProgress\s*>\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = currentProgress > threshold
    return result
  }
  
  if (/^currentProgress\s*<\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/currentProgress\s*<\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = currentProgress < threshold
    return result
  }

  // ─────────────────────────────────────────────────────────
  // BLOCO 7: currentModule
  // ─────────────────────────────────────────────────────────
  
  if (/^currentModule\s*===\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/currentModule\s*===\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = currentModule === threshold
    return result
  }
  
  if (/^currentModule\s*>=\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/currentModule\s*>=\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = currentModule >= threshold
    return result
  }
  
  if (/^currentModule\s*>\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/currentModule\s*>\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = currentModule > threshold
    return result
  }
  
  if (/^currentModule\s*<\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/currentModule\s*<\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = currentModule < threshold
    return result
  }

  // ─────────────────────────────────────────────────────────
  // BLOCO 8: engagementScore
  // ─────────────────────────────────────────────────────────
  
  if (/^engagementScore\s*<\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/engagementScore\s*<\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = engagementScore < threshold
    return result
  }
  
  if (/^engagementScore\s*>=\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/engagementScore\s*>=\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = engagementScore >= threshold
    return result
  }

  // ─────────────────────────────────────────────────────────
  // BLOCO 9: totalLogins
  // ─────────────────────────────────────────────────────────
  
  if (/^totalLogins\s*>=\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/totalLogins\s*>=\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = totalLogins >= threshold
    return result
  }

  // ─────────────────────────────────────────────────────────
  // BLOCO 10: totalActions
  // ─────────────────────────────────────────────────────────
  
  if (/^totalActions\s*>=\s*\d+$/i.test(condition.trim())) {
    const m = condition.match(/totalActions\s*>=\s*(\d+)/i)
    const threshold = Number(m?.[1] || 0)
    const result = totalActions >= threshold
    return result
  }

  // ═══════════════════════════════════════════════════════════
  // FALLBACK: Condição não reconhecida
  // ═══════════════════════════════════════════════════════════
  console.warn(`[DecisionEngine] ⚠️ Condição não reconhecida: "${condition}"`)
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