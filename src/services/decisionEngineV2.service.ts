// ═══════════════════════════════════════════════════════════
// 🧠 DECISION ENGINE V2: Decisões por UserProduct
// Objetivo: Avaliar regras e tomar decisões POR PRODUTO (não global)
// ═══════════════════════════════════════════════════════════

import UserProduct from '../models/UserProduct'
import Product from '../models/Product'
import User from '../models/user'
import TagRule from '../models/TagRule'
import activeCampaignService from './activeCampaignService'

// ═══════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════

export interface DecisionContext {
  userId: string
  productId: string
  userProduct: any
  user: any
  product: any
  rules: any[]
}

export interface Decision {
  ruleId: string
  ruleName: string
  condition: string
  action: 'APPLY_TAG' | 'REMOVE_TAG' | 'SEND_EMAIL' | 'NONE'
  tagName?: string
  shouldExecute: boolean
  reason: string
}

export interface DecisionResult {
  userId: string
  productId: string
  productCode: string
  decisions: Decision[]
  tagsToApply: string[]
  tagsToRemove: string[]
  actionsExecuted: number
  errors: string[]
}

// ═══════════════════════════════════════════════════════════
// DECISION ENGINE CLASS
// ═══════════════════════════════════════════════════════════

class DecisionEngineV2 {
  
  /**
   * Avaliar todas as regras para um UserProduct
   */
  async evaluateUserProduct(
    userId: string,
    productId: string
  ): Promise<DecisionResult> {
    console.log(`[DecisionEngine V2] Avaliando userId=${userId}, productId=${productId}`)

    const result: DecisionResult = {
      userId,
      productId,
      productCode: '',
      decisions: [],
      tagsToApply: [],
      tagsToRemove: [],
      actionsExecuted: 0,
      errors: []
    }

    try {
      // 1. Buscar contexto
      const context = await this.getContext(userId, productId)
      result.productCode = context.product.code

      // 2. Avaliar regras
      for (const rule of context.rules) {
        const decision = await this.evaluateRule(rule, context)
        result.decisions.push(decision)

        if (decision.shouldExecute && decision.tagName) {
          if (decision.action === 'APPLY_TAG') {
            result.tagsToApply.push(decision.tagName)
          } else if (decision.action === 'REMOVE_TAG') {
            result.tagsToRemove.push(decision.tagName)
          }
        }
      }

      // 3. Executar decisões
      await this.executeDecisions(result)

      console.log(`[DecisionEngine V2] ✅ Avaliação completa: ${result.actionsExecuted} ações`)

    } catch (error: any) {
      console.error(`[DecisionEngine V2] ❌ Erro:`, error.message)
      result.errors.push(error.message)
    }

    return result
  }

  /**
   * Obter contexto completo para avaliação
   */
  private async getContext(
    userId: string,
    productId: string
  ): Promise<DecisionContext> {
    const userProduct = await UserProduct.findOne({ userId, productId })
    const user = await User.findById(userId)
    const product = await Product.findById(productId)

    if (!userProduct || !user || !product) {
      throw new Error('UserProduct, User ou Product não encontrado')
    }

    // Buscar regras aplicáveis a este produto
    const rules = await TagRule.find({
      productId: productId,
      isActive: true
    })

    return {
      userId,
      productId,
      userProduct,
      user,
      product,
      rules
    }
  }

  /**
   * Avaliar uma regra específica
   */
  private async evaluateRule(
    rule: any,
    context: DecisionContext
  ): Promise<Decision> {
    const decision: Decision = {
      ruleId: rule._id.toString(),
      ruleName: rule.name,
      condition: rule.condition,
      action: rule.action,
      tagName: rule.tagName,
      shouldExecute: false,
      reason: ''
    }

    try {
      // Avaliar condição da regra
      const conditionMet = await this.evaluateCondition(rule.condition, context)

      if (conditionMet) {
        decision.shouldExecute = true
        decision.reason = 'Condição satisfeita'
      } else {
        decision.reason = 'Condição não satisfeita'
      }

    } catch (error: any) {
      decision.reason = `Erro ao avaliar: ${error.message}`
    }

    return decision
  }

  /**
   * Avaliar condição (pode ser expressão complexa)
   */
  private async evaluateCondition(
    condition: string,
    context: DecisionContext
  ): Promise<boolean> {
    try {
      // Extrair dados do contexto
      const {
        daysSinceLastLogin,
        daysSinceLastAction,
        engagementScore,
        totalLogins,
        totalActions
      } = this.extractMetrics(context)

      // Criar contexto seguro para avaliação
      const safeContext = {
        daysSinceLastLogin,
        daysSinceLastAction,
        engagementScore,
        totalLogins,
        totalActions,
        productCode: context.product.code,
        platform: context.userProduct.platform
      }

      // Avaliar condição (exemplo simples)
      // Em produção, usar biblioteca de avaliação segura
      if (condition.includes('daysSinceLastLogin >=')) {
        const threshold = parseInt(condition.match(/(\d+)/)?.[1] || '0')
        return daysSinceLastLogin >= threshold
      }

      if (condition.includes('daysSinceLastAction >=')) {
        const threshold = parseInt(condition.match(/(\d+)/)?.[1] || '0')
        return daysSinceLastAction >= threshold
      }

      if (condition.includes('engagementScore <')) {
        const threshold = parseInt(condition.match(/(\d+)/)?.[1] || '0')
        return engagementScore < threshold
      }

      // Default: condição não reconhecida
      console.warn(`[DecisionEngine V2] Condição não reconhecida: ${condition}`)
      return false

    } catch (error: any) {
      console.error(`[DecisionEngine V2] Erro ao avaliar condição:`, error.message)
      return false
    }
  }

  /**
   * Extrair métricas do UserProduct
   */
  private extractMetrics(context: DecisionContext): Record<string, number> {
    const { userProduct } = context

    return {
      daysSinceLastLogin: userProduct.engagement?.daysSinceLastLogin || 999,
      daysSinceLastAction: userProduct.engagement?.daysSinceLastAction || 999,
      engagementScore: userProduct.engagement?.engagementScore || 0,
      totalLogins: userProduct.engagement?.totalLogins || 0,
      totalActions: userProduct.engagement?.totalActions || 0
    }
  }

  /**
   * Executar decisões (aplicar tags, etc)
   */
  private async executeDecisions(result: DecisionResult): Promise<void> {
    // Remover tags
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

    // Aplicar tags
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

  /**
   * Avaliar TODOS os UserProducts de um user
   */
  async evaluateAllUserProducts(userId: string): Promise<DecisionResult[]> {
    const userProducts = await UserProduct.find({ userId })
    const results: DecisionResult[] = []

    for (const up of userProducts) {
      const result = await this.evaluateUserProduct(
        userId,
        up.productId.toString()
      )
      results.push(result)
    }

    return results
  }

  /**
   * Avaliar TODOS os UserProducts de um produto
   */
  async evaluateAllUsersOfProduct(productId: string): Promise<DecisionResult[]> {
    const userProducts = await UserProduct.find({ productId })
    const results: DecisionResult[] = []

    for (const up of userProducts) {
      const result = await this.evaluateUserProduct(
        up.userId.toString(),
        productId
      )
      results.push(result)
    }

    return results
  }

  /**
   * Resolver conflitos entre decisões (se houver)
   */
  private resolveConflicts(decisions: Decision[]): Decision[] {
    // Se múltiplas regras tentam aplicar/remover mesma tag
    // Priorizar remoções sobre aplicações (safer)
    
    const resolved: Decision[] = []
    const tagActions = new Map<string, Decision[]>()

    // Agrupar por tag
    decisions.forEach(decision => {
      if (decision.tagName) {
        const key = decision.tagName
        if (!tagActions.has(key)) {
          tagActions.set(key, [])
        }
        tagActions.get(key)!.push(decision)
      }
    })

    // Resolver conflitos
    tagActions.forEach((actions, tag) => {
      const hasRemove = actions.some(a => a.action === 'REMOVE_TAG' && a.shouldExecute)
      const hasApply = actions.some(a => a.action === 'APPLY_TAG' && a.shouldExecute)

      if (hasRemove && hasApply) {
        // Conflito: Priorizar remoção
        const removeDecision = actions.find(a => a.action === 'REMOVE_TAG')!
        removeDecision.reason += ' (conflito resolvido: prioridade remoção)'
        resolved.push(removeDecision)
      } else {
        // Sem conflito: adicionar todas
        resolved.push(...actions.filter(a => a.shouldExecute))
      }
    })

    return resolved
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT SINGLETON
// ═══════════════════════════════════════════════════════════

export const decisionEngineV2 = new DecisionEngineV2()
export default decisionEngineV2

