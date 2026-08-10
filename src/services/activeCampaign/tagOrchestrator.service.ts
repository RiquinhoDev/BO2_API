import UserProduct from '../../models/UserProduct'
import Product from '../../models/product/Product'
import User from '../../models/user'
import { getLastLearnerActivityDate } from '../activity/learnerActivity'
import { TagOrchestratorCore } from './tagOrchestrator/core'
import {
  errorMessage,
  ExecutionStats,
  isBOTag,
  OrchestrationContext,
  OrchestrationResult,
  TagOperation
} from './tagOrchestrator/contracts'

export type { ExecutionStats, OrchestrationResult, TagOperation } from './tagOrchestrator/contracts'

class TagOrchestratorV2 extends TagOrchestratorCore {  async orchestrateMultipleUserProducts(
    items: Array<{ userId: string; productId: string }>
  ): Promise<OrchestrationResult[]> {
    const results: OrchestrationResult[] = []

    for (const item of items) {
      try {
        const r = await this.orchestrateUserProduct(item.userId, item.productId)
        results.push(r)
      } catch (error: unknown) {
        results.push({
          userId: item.userId,
          productId: item.productId,
          productCode: '',
          tagsApplied: [],
          tagsRemoved: [],
          communicationsTriggered: 0,
          success: false,
          error: errorMessage(error)
        })
      }
    }

    return results
  }

  /**
   * Estatísticas de execução (equivalente ao getExecutionStats do V1)
   */
  getExecutionStats(results: OrchestrationResult[]): ExecutionStats {
    const total = results.length
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    const byProduct: Record<string, number> = {}
    const appliedTotal = results.reduce((sum, r) => sum + (r.tagsApplied?.length || 0), 0)
    const removedTotal = results.reduce((sum, r) => sum + (r.tagsRemoved?.length || 0), 0)

    results.forEach(r => {
      const k = r.productCode || 'UNKNOWN'
      byProduct[k] = (byProduct[k] || 0) + 1
    })

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? `${((successful / total) * 100).toFixed(1)}%` : '0%',
      appliedTotal,
      removedTotal,
      byProduct
    }
  }

  /**
   * Orquestrar TODOS os UserProducts de um user
   */
  async orchestrateAllUserProducts(userId: string): Promise<OrchestrationResult[]> {
    const userProducts = await UserProduct.find({ userId })
    const results: OrchestrationResult[] = []

    for (const up of userProducts) {
      const r = await this.orchestrateUserProduct(userId, up.productId.toString())
      results.push(r)
    }

    return results
  }

  /**
   * Orquestrar TODOS os users de um produto
   */
  async orchestrateAllUsersOfProduct(productId: string): Promise<OrchestrationResult[]> {
    const userProducts = await UserProduct.find({ productId })
    const results: OrchestrationResult[] = []

    for (const up of userProducts) {
      const r = await this.orchestrateUserProduct(up.userId.toString(), productId)
      results.push(r)
    }

    return results
  }

  /**
   * Executar operação em batch (com rate limiting)
   */
  async executeBatchOperation(operations: TagOperation[], rateLimit: number = 5): Promise<number> {
    let successCount = 0
    let currentBatch: TagOperation[] = []

    for (let i = 0; i < operations.length; i++) {
      currentBatch.push(operations[i])

      if (currentBatch.length === rateLimit || i === operations.length - 1) {
        const promises = currentBatch.map(async (op) => {
          const user = await User.findById(op.userId)
          const product = await Product.findById(op.productId)
          if (!user || !product) return false

          const lastActivity = getLastLearnerActivityDate(user, product.code)
          const ctx: OrchestrationContext = {
            productCode: String(product.code || '').toUpperCase(),
            lastActivity,
            daysInactive: this.calculateDaysInactive(lastActivity)
          }

          return op.action === 'APPLY'
            ? (await this.applyTag(op.userId, op.productId, op.tag, ctx)).ok
            : (await this.removeTag(op.userId, op.productId, op.tag, ctx)).ok
        })

        const batchResults = await Promise.all(promises)
        successCount += batchResults.filter(Boolean).length

        currentBatch = []

        if (i < operations.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
    }

    return successCount
  }

  /**
   * Cleanup: Remover tags órfãs (não mais válidas)
   */
  async cleanupOrphanTags(userId: string, productId: string): Promise<string[]> {
    const userProduct = await UserProduct.findOne({ userId, productId })
    const user = await User.findById(userId)
    const product = await Product.findById(productId)

    if (!userProduct || !user || !product) return []

    const productCode = String(product.code || '').toUpperCase()
    const currentTags = userProduct.activeCampaignData?.tags || []
    const tagsToRemove: string[] = []

    for (const t of currentTags) {
      // 🔒 FILTRO CRÍTICO: Apenas remover se for tag BO!
      if (isBOTag(t) && !String(t).toUpperCase().startsWith(productCode + '_')) {
        tagsToRemove.push(t)
      }
    }

    const lastActivity = getLastLearnerActivityDate(user, product.code)
    const ctx: OrchestrationContext = {
      productCode,
      lastActivity,
      daysInactive: this.calculateDaysInactive(lastActivity)
    }

    for (const t of tagsToRemove) {
      await this.removeTag(userId, productId, t, ctx)
    }

    return tagsToRemove
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT SINGLETON
// ═══════════════════════════════════════════════════════════

export const tagOrchestratorV2 = new TagOrchestratorV2()
export default tagOrchestratorV2
