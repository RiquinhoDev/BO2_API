// ═══════════════════════════════════════════════════════════
// 🎭 TAG ORCHESTRATOR V2: Orquestração de Tags por Produto
// Objetivo: Coordenar aplicação de tags POR UserProduct
// ═══════════════════════════════════════════════════════════

import UserProduct from '../models/UserProduct'
import Product from '../models/Product'
import User from '../models/user'
import activeCampaignService from './activeCampaignService'
import { decisionEngineV2 } from './decisionEngineV2.service'
import CommunicationHistory from '../models/CommunicationHistory'

// ═══════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════

export interface TagOperation {
  userId: string
  productId: string
  tag: string
  action: 'APPLY' | 'REMOVE'
  reason?: string
}

export interface OrchestrationResult {
  userId: string
  productId: string
  productCode: string
  tagsApplied: string[]
  tagsRemoved: string[]
  communicationsTriggered: number
  success: boolean
  error?: string
}

// ═══════════════════════════════════════════════════════════
// TAG ORCHESTRATOR CLASS
// ═══════════════════════════════════════════════════════════

class TagOrchestratorV2 {

  /**
   * Orquestrar tags para um UserProduct específico
   */
  async orchestrateUserProduct(
    userId: string,
    productId: string
  ): Promise<OrchestrationResult> {
    console.log(`[TagOrchestrator V2] Orquestrando userId=${userId}, productId=${productId}`)

    const result: OrchestrationResult = {
      userId,
      productId,
      productCode: '',
      tagsApplied: [],
      tagsRemoved: [],
      communicationsTriggered: 0,
      success: false
    }

    try {
      // 1. Buscar contexto
      const userProduct = await UserProduct.findOne({ userId, productId })
      const user = await User.findById(userId)
      const product = await Product.findById(productId)

      if (!userProduct || !user || !product) {
        throw new Error('UserProduct, User ou Product não encontrado')
      }

      result.productCode = product.code

      // 2. Avaliar decisões via DecisionEngine V2
      const decisions = await decisionEngineV2.evaluateUserProduct(userId, productId)

      // 3. Aplicar tags determinadas
      for (const tag of decisions.tagsToApply) {
        const applied = await this.applyTag(userId, productId, tag)
        if (applied) {
          result.tagsApplied.push(tag)
        }
      }

      // 4. Remover tags determinadas
      for (const tag of decisions.tagsToRemove) {
        const removed = await this.removeTag(userId, productId, tag)
        if (removed) {
          result.tagsRemoved.push(tag)
        }
      }

      // 5. Registrar comunicações (se houver)
      if (result.tagsApplied.length > 0 || result.tagsRemoved.length > 0) {
        await this.logCommunication(userId, productId, result)
        result.communicationsTriggered = 1
      }

      result.success = true
      console.log(`[TagOrchestrator V2] ✅ Orquestração completa: ${result.tagsApplied.length} aplicadas, ${result.tagsRemoved.length} removidas`)

    } catch (error: any) {
      result.success = false
      result.error = error.message
      console.error(`[TagOrchestrator V2] ❌ Erro:`, error.message)
    }

    return result
  }

  /**
   * Aplicar tag a um UserProduct
   */
  private async applyTag(
    userId: string,
    productId: string,
    tag: string
  ): Promise<boolean> {
    try {
      await activeCampaignService.applyTagToUserProduct(userId, productId, tag)
      console.log(`[TagOrchestrator V2] ✅ Tag aplicada: ${tag}`)
      return true
    } catch (error: any) {
      console.error(`[TagOrchestrator V2] ❌ Erro ao aplicar tag ${tag}:`, error.message)
      return false
    }
  }

  /**
   * Remover tag de um UserProduct
   */
  private async removeTag(
    userId: string,
    productId: string,
    tag: string
  ): Promise<boolean> {
    try {
      await activeCampaignService.removeTagFromUserProduct(userId, productId, tag)
      console.log(`[TagOrchestrator V2] ✅ Tag removida: ${tag}`)
      return true
    } catch (error: any) {
      console.error(`[TagOrchestrator V2] ❌ Erro ao remover tag ${tag}:`, error.message)
      return false
    }
  }

  /**
   * Registrar comunicação no histórico
   */
  private async logCommunication(
    userId: string,
    productId: string,
    result: OrchestrationResult
  ): Promise<void> {
    try {
      await CommunicationHistory.create({
        userId,
        productId,
        type: 'TAG_AUTOMATION',
        channel: 'ACTIVE_CAMPAIGN',
        subject: `Tags atualizadas: ${result.productCode}`,
        content: `Aplicadas: ${result.tagsApplied.join(', ')}. Removidas: ${result.tagsRemoved.join(', ')}`,
        status: 'SENT',
        sentAt: new Date(),
        metadata: {
          tagsApplied: result.tagsApplied,
          tagsRemoved: result.tagsRemoved,
          orchestratorVersion: 'V2'
        }
      })

      console.log(`[TagOrchestrator V2] 📝 Comunicação registada`)
    } catch (error: any) {
      console.error(`[TagOrchestrator V2] ⚠️ Erro ao registar comunicação:`, error.message)
    }
  }

  /**
   * Orquestrar TODOS os UserProducts de um user
   */
  async orchestrateAllUserProducts(userId: string): Promise<OrchestrationResult[]> {
    console.log(`[TagOrchestrator V2] Orquestrando todos os produtos do user ${userId}`)

    const userProducts = await UserProduct.find({ userId })
    const results: OrchestrationResult[] = []

    for (const up of userProducts) {
      const result = await this.orchestrateUserProduct(
        userId,
        up.productId.toString()
      )
      results.push(result)
    }

    const totalSuccess = results.filter(r => r.success).length
    console.log(`[TagOrchestrator V2] ✅ Orquestração completa: ${totalSuccess}/${results.length} sucesso`)

    return results
  }

  /**
   * Orquestrar TODOS os users de um produto
   */
  async orchestrateAllUsersOfProduct(productId: string): Promise<OrchestrationResult[]> {
    console.log(`[TagOrchestrator V2] Orquestrando todos os users do produto ${productId}`)

    const userProducts = await UserProduct.find({ productId })
    const results: OrchestrationResult[] = []

    for (const up of userProducts) {
      const result = await this.orchestrateUserProduct(
        up.userId.toString(),
        productId
      )
      results.push(result)
    }

    const totalSuccess = results.filter(r => r.success).length
    console.log(`[TagOrchestrator V2] ✅ Orquestração completa: ${totalSuccess}/${results.length} sucesso`)

    return results
  }

  /**
   * Executar operação em batch (com rate limiting)
   */
  async executeBatchOperation(
    operations: TagOperation[],
    rateLimit: number = 5
  ): Promise<number> {
    console.log(`[TagOrchestrator V2] Executando ${operations.length} operações em batch`)

    let successCount = 0
    let currentBatch: TagOperation[] = []

    for (let i = 0; i < operations.length; i++) {
      currentBatch.push(operations[i])

      // Executar batch quando atingir limite ou final
      if (currentBatch.length === rateLimit || i === operations.length - 1) {
        const promises = currentBatch.map(op => 
          op.action === 'APPLY' 
            ? this.applyTag(op.userId, op.productId, op.tag)
            : this.removeTag(op.userId, op.productId, op.tag)
        )

        const results = await Promise.all(promises)
        successCount += results.filter(r => r).length

        currentBatch = []

        // Rate limiting: aguardar 1s entre batches
        if (i < operations.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
    }

    console.log(`[TagOrchestrator V2] ✅ Batch completo: ${successCount}/${operations.length} sucesso`)
    return successCount
  }

  /**
   * Cleanup: Remover tags órfãs (não mais válidas)
   */
  async cleanupOrphanTags(userId: string, productId: string): Promise<string[]> {
    console.log(`[TagOrchestrator V2] Limpando tags órfãs para userId=${userId}, productId=${productId}`)

    const userProduct = await UserProduct.findOne({ userId, productId })
    const product = await Product.findById(productId)

    if (!userProduct || !product) {
      return []
    }

    const currentTags = userProduct.activeCampaignData?.tags || []
    const tagsToRemove: string[] = []

    // Tags consideradas órfãs:
    // 1. Tags sem prefixo do produto correto
    // 2. Tags de níveis conflitantes (ex: INATIVO_7D + INATIVO_14D ao mesmo tempo)

    for (const tag of currentTags) {
      // Verificar prefixo
      if (!tag.startsWith(product.code + '_')) {
        tagsToRemove.push(tag)
        continue
      }

      // Verificar conflitos (exemplo: múltiplas tags de inatividade)
      // Esta lógica pode ser expandida conforme necessário
    }

    // Remover tags órfãs
    for (const tag of tagsToRemove) {
      await this.removeTag(userId, productId, tag)
    }

    console.log(`[TagOrchestrator V2] ✅ ${tagsToRemove.length} tags órfãs removidas`)
    return tagsToRemove
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT SINGLETON
// ═══════════════════════════════════════════════════════════

export const tagOrchestratorV2 = new TagOrchestratorV2()
export default tagOrchestratorV2

