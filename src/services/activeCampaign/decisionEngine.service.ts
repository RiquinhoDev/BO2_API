// =====================================================
// 📁 src/services/ac/decisionEngine.service.ts
// ✅ UNIFICADO: Decision Engine por UserProduct (1 única fonte)
// - Usa TagRules por produto
// - Faz escalonamento (níveis) a partir das regras
// - Cooldown + progresso recente
// - Executa tags via activeCampaignService
// =====================================================

import logger from '../../utils/logger'
import UserProduct from '../../models/UserProduct'
import UserAction from '../../models/UserAction'
import activeCampaignService from './activeCampaignService'
import { getLastLearnerActivityDate } from '../activity/learnerActivity'
import { evaluateDecisionCondition } from './decisionConditionEvaluator'
import { buildDecisionLevelPlan, splitDecisionRules } from './decisionLevelPolicy'
import { loadDecisionContext, mongooseDecisionContextRepositories } from './decisionContextLoader'
import { calculateDecisionMetrics } from './decisionMetrics'
import type {
  DecisionContext,
  DecisionMetrics,
  DecisionUserProduct,
  InternalRule
} from './decisionContextTypes'

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
  metadata?: Record<string, unknown>
}

const DEFAULT_COOLDOWN_DAYS = 3

function nowUTC(): Date {
  return new Date()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro desconhecido'
}



function getCooldownUntil(userProduct: DecisionUserProduct): Date | undefined {
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



// ─────────────────────────────────────────────────────────────
// ENGINE
// ─────────────────────────────────────────────────────────────

class DecisionEngine {
  // ───────────────────────────────────────────────────────────
  // PUBLIC API
  // ───────────────────────────────────────────────────────────

async evaluateUserProduct(
  userId: string,
  productId: string,
  dryRun: boolean = false
): Promise<DecisionResult> {
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
      const context = await loadDecisionContext(
        userId,
        productId,
        mongooseDecisionContextRepositories
      )
      result.productCode = context.product.code

      const { levelRules, regularRules } = splitDecisionRules(context.rules)

      const metrics = calculateDecisionMetrics(context.userProduct, {
        now: nowUTC(),
        getLastActivity: () => getLastLearnerActivityDate(context.user, context.product.code)
      })
      const daysInactive = metrics.daysSinceLastLogin

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

      const recentProgress = await this.checkRecentProgress(
        userId,
        context.product.code,
        {
          daysSinceLastLogin: metrics.daysSinceLastLogin,
          daysSinceLastAction: metrics.daysSinceLastAction
        }
      )

      const levelPlan = buildDecisionLevelPlan({
        levelRules,
        daysInactive,
        storedCurrentLevel: context.userProduct.reengagement?.currentLevel,
        existingTags: context.userProduct.activeCampaignData?.tags || [],
        recentProgress,
        now: nowUTC(),
        defaultCooldownDays: DEFAULT_COOLDOWN_DAYS
      })

      result.currentLevel = levelPlan.currentLevel
      result.appropriateLevel = levelPlan.appropriateLevel
      result.decisions.push(...levelPlan.decisions)
      result.tagsToApply.push(...levelPlan.tagsToApply)
      result.tagsToRemove.push(...levelPlan.tagsToRemove)
      result.nextEvaluationDate = levelPlan.cooldownUntil

      if (levelPlan.transition === 'recent-progress') {
        if (!dryRun && levelPlan.cooldownUntil) {
          await setCooldown(context.userProduct._id.toString(), levelPlan.cooldownUntil)
        }
      } else if (levelPlan.transition === 'back-active') {
        if (!dryRun && levelPlan.cooldownUntil) {
          await setCooldown(context.userProduct._id.toString(), levelPlan.cooldownUntil)
        }
      } else if (levelPlan.transition === 'escalate') {
        if (!dryRun && levelPlan.cooldownUntil) {
          await setCooldown(context.userProduct._id.toString(), levelPlan.cooldownUntil)
        }
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
        if (!dryRun) {
          await this.executeDecisions(result)
        }

        return result
      } catch (error: unknown) {
        result.errors.push(errorMessage(error))
        return result
      }
    }

    async evaluateAllUserProducts(
      userId: string,
      dryRun: boolean = false
    ): Promise<DecisionResult[]> {
      const userProducts = await UserProduct.find({ userId })
      const out: DecisionResult[] = []

      for (const up of userProducts) {
        out.push(await this.evaluateUserProduct(userId, up.productId.toString(), dryRun))
      }

      return out
    }

    async evaluateAllUsersOfProduct(
      productId: string,
      dryRun: boolean = false
    ): Promise<DecisionResult[]> {
      const userProducts = await UserProduct.find({
        productId,
        status: 'ACTIVE'
      })
      const out: DecisionResult[] = []

      for (const up of userProducts) {
        out.push(await this.evaluateUserProduct(up.userId.toString(), productId, dryRun))
      }

      return out
    }

    // ───────────────────────────────────────────────────────────
    // CONTEXT / METRICS
    // ───────────────────────────────────────────────────────────

  // RULE EVAL
  // ───────────────────────────────────────────────────────────

  private async evaluateRule(
    rule: InternalRule,
    context: DecisionContext,
    metrics: DecisionMetrics
  ): Promise<Decision> {
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
    } catch (error: unknown) {
      decision.shouldExecute = false
      decision.reason = `Erro ao avaliar: ${errorMessage(error)}`
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

private evaluateCondition(
  condition: string | undefined,
  context: DecisionContext,
  metrics: DecisionMetrics
): boolean {
  return evaluateDecisionCondition(
    condition,
    {
      daysSinceLastLogin: metrics.daysSinceLastLogin,
      daysSinceLastAction: metrics.daysSinceLastAction,
      daysSinceEnrollment: metrics.daysSinceEnrollment,
      engagementScore: metrics.engagementScore,
      totalLogins: metrics.totalLogins,
      totalActions: metrics.totalActions,
      currentProgress: context.userProduct.progress?.percentage,
      currentModule: context.userProduct.progress?.currentModule
    },
    unknownCondition => {
      logger.warn(`[DecisionEngine] CondiÃ§Ã£o nÃ£o reconhecida: "${unknownCondition}"`)
    }
  )
}

  // ─────────────────────────────────────────────────────────────
  // PROGRESS
  // ─────────────────────────────────────────────────────────────
  private async checkRecentProgress(
    userId: string,
    productCode: string,
    metrics: { daysSinceLastLogin: number | null; daysSinceLastAction: number | null }
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
      } catch (error: unknown) {
        result.errors.push(`Erro ao remover tag ${tag}: ${errorMessage(error)}`)
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
      } catch (error: unknown) {
        result.errors.push(`Erro ao aplicar tag ${tag}: ${errorMessage(error)}`)
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORT SINGLETON
// ─────────────────────────────────────────────────────────────

export const decisionEngine = new DecisionEngine()
export default decisionEngine

