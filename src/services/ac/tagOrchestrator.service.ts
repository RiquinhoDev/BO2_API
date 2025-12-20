// ═══════════════════════════════════════════════════════════
// 🎭 TAG ORCHESTRATOR V2: Orquestração de Tags por Produto
// Prioridade: ✅ V2 é a fonte principal
// Extras trazidos do V1: stats, múltiplas execuções, helpers de inatividade,
// normalização de tags (raw/full), sync opcional StudentEngagementState,
// metadata melhor no CommunicationHistory.
// ═══════════════════════════════════════════════════════════

import UserProduct from '../../models/UserProduct'
import Product from '../../models/Product'
import User from '../../models/user'
import activeCampaignService from './activeCampaignService'
import CommunicationHistory from '../../models/acTags/CommunicationHistory'

// (Legacy, mas útil): manter sync de estado/cooldowns se o modelo existir no projeto
import ProductProfile, { IProductProfile, IReengagementLevel } from '../../models/ProductProfile'

import StudentEngagementState from '../../models/StudentEngagementState'
import decisionEngine from './decisionEngine.service'

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
  tagsApplied: string[]     // ⚠️ Guardamos FULL TAGS (ex: OGI_INATIVO_14D)
  tagsRemoved: string[]     // ⚠️ Guardamos FULL TAGS
  communicationsTriggered: number
  success: boolean
  error?: string
}

type OrchestrationContext = {
  user: any
  product: any
  lastActivity: Date
  daysInactive: number
}

// ═══════════════════════════════════════════════════════════
// TAG ORCHESTRATOR CLASS
// ═══════════════════════════════════════════════════════════

class TagOrchestratorV2 {
  /**
   * Orquestrar tags para um UserProduct específico
   */
  async orchestrateUserProduct(userId: string, productId: string): Promise<OrchestrationResult> {
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
      // 1) Contexto
      const userProduct = await UserProduct.findOne({ userId, productId })
      const user = await User.findById(userId)
      const product = await Product.findById(productId)

      if (!userProduct || !user || !product) {
        throw new Error('UserProduct, User ou Product não encontrado')
      }

      const productCode = String(product.code || '').toUpperCase()
      result.productCode = productCode

      const lastActivity = this.getUserLastActivity(user, productCode)
      const daysInactive = this.calculateDaysInactive(lastActivity)

      const ctx: OrchestrationContext = { user, product, lastActivity, daysInactive }

      // 2) Decisões
      const decisions = await decisionEngine.evaluateUserProduct(userId, productId)

      // 3) Aplicar tags
      for (const tag of decisions.tagsToApply || []) {
        const applied = await this.applyTag(userId, productId, tag, ctx)
        if (applied.ok) result.tagsApplied.push(applied.fullTag)
      }

      // 4) Remover tags
      for (const tag of decisions.tagsToRemove || []) {
        const removed = await this.removeTag(userId, productId, tag, ctx)
        if (removed.ok) result.tagsRemoved.push(removed.fullTag)
      }

      // 5) Histórico de comunicações (1 registo por orquestração)
      if (result.tagsApplied.length > 0 || result.tagsRemoved.length > 0) {
        await this.logCommunication(userId, productId, result, ctx)
        result.communicationsTriggered = 1
      }

      result.success = true
      console.log(
        `[TagOrchestrator V2] ✅ Orquestração completa: ${result.tagsApplied.length} aplicadas, ${result.tagsRemoved.length} removidas`
      )
    } catch (error: any) {
      result.success = false
      result.error = error.message
      console.error(`[TagOrchestrator V2] ❌ Erro:`, error.message)
    }

    return result
  }

  // ─────────────────────────────────────────────────────────────
  // APPLY / REMOVE (com normalização + sync StudentEngagementState)
  // ─────────────────────────────────────────────────────────────

  private async applyTag(
    userId: string,
    productId: string,
    tag: string,
    ctx: OrchestrationContext
  ): Promise<{ ok: boolean; fullTag: string }> {
    const productCode = String(ctx.product.code || '').toUpperCase()
    const { rawTag, fullTag } = this.normalizeTagForProduct(tag, productCode)

    try {
      const ok = await activeCampaignService.applyTagToUserProduct(userId, productId, rawTag)
      if (!ok) return { ok: false, fullTag }

      const level = this.inferLevelFromTag(fullTag)

      // Sync opcional do StudentEngagementState (trazido do V1)
      await this.syncStudentStateOnApply(userId, productCode, fullTag, level, ctx)

      console.log(`[TagOrchestrator V2] ✅ Tag aplicada: ${fullTag}`)
      return { ok: true, fullTag }
    } catch (error: any) {
      console.error(`[TagOrchestrator V2] ❌ Erro ao aplicar tag ${fullTag}:`, error.message)
      return { ok: false, fullTag }
    }
  }

  private async removeTag(
    userId: string,
    productId: string,
    tag: string,
    ctx: OrchestrationContext
  ): Promise<{ ok: boolean; fullTag: string }> {
    const productCode = String(ctx.product.code || '').toUpperCase()
    const { rawTag, fullTag } = this.normalizeTagForProduct(tag, productCode)

    try {
      const ok = await activeCampaignService.removeTagFromUserProduct(userId, productId, rawTag)
      if (!ok) return { ok: false, fullTag }

      // Sync opcional do StudentEngagementState (trazido do V1)
      await this.syncStudentStateOnRemove(userId, productCode, fullTag, ctx)

      // Atualizar última comunicação como “returned/success” (tolerante)
      await this.markLastCommunicationAsReturned(userId, productId, fullTag)

      console.log(`[TagOrchestrator V2] ✅ Tag removida: ${fullTag}`)
      return { ok: true, fullTag }
    } catch (error: any) {
      console.error(`[TagOrchestrator V2] ❌ Erro ao remover tag ${fullTag}:`, error.message)
      return { ok: false, fullTag }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // COMMUNICATION HISTORY (melhor metadata)
  // ─────────────────────────────────────────────────────────────

  private async logCommunication(
    userId: string,
    productId: string,
    result: OrchestrationResult,
    ctx: OrchestrationContext
  ): Promise<void> {
    try {
      await CommunicationHistory.create({
        userId,
        productId,
        type: 'TAG_AUTOMATION',
        channel: 'ACTIVE_CAMPAIGN',
        subject: `Tags atualizadas: ${result.productCode}`,
        content: `Aplicadas: ${result.tagsApplied.join(', ') || '—'}. Removidas: ${result.tagsRemoved.join(', ') || '—'}`,
        status: 'SENT',
        sentAt: new Date(),
        metadata: {
          productCode: result.productCode,
          tagsApplied: result.tagsApplied,
          tagsRemoved: result.tagsRemoved,
          orchestratorVersion: 'V2',
          // extras do V1:
          lastActivity: ctx.lastActivity,
          daysInactive: ctx.daysInactive
        }
      })

      console.log(`[TagOrchestrator V2] 📝 Comunicação registada`)
    } catch (error: any) {
      console.error(`[TagOrchestrator V2] ⚠️ Erro ao registar comunicação:`, error.message)
    }
  }

  private async markLastCommunicationAsReturned(
    userId: string,
    productId: string,
    fullTag: string
  ): Promise<void> {
    try {
      // Tolerante: se o schema não tiver estes campos, não parte nada (strict pode ignorar)
      await CommunicationHistory.findOneAndUpdate(
        {
          userId,
          productId,
          'metadata.tagsApplied': fullTag,
          'metadata.outcome': { $ne: 'SUCCESS' }
        },
        {
          $set: {
            'metadata.outcome': 'SUCCESS',
            'metadata.returnedAt': new Date()
          }
        },
        { sort: { sentAt: -1 } }
      )
    } catch {
      // silêncio: isto é “best effort”
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SYNC StudentEngagementState (trazido do V1)
  // ─────────────────────────────────────────────────────────────

  private async syncStudentStateOnApply(
    userId: string,
    productCode: string,
    fullTag: string,
    level: number | undefined,
    ctx: OrchestrationContext
  ): Promise<void> {
    try {
      const code = productCode.toUpperCase()

      // Buscar ou criar estado
      let studentState: any = await StudentEngagementState.findOne({ userId, productCode: code })

      if (!studentState) {
        studentState = await StudentEngagementState.create({
          userId,
          productCode: code,
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
        })
      }

      // aplicar tag / nível (se o modelo tiver métodos)
      if (typeof studentState.applyTag === 'function') {
        studentState.applyTag(fullTag, level || 0)
      }

      // cooldown via ProductProfile (se existir config)
      if (level && typeof studentState.setCooldown === 'function') {
        const profile = await ProductProfile
          .findOne({ code })
          .select({ reengagementLevels: 1 })
          .lean()
          .exec() as Pick<IProductProfile, 'reengagementLevels'> | null

        
          
        const cooldownDays = profile?.reengagementLevels?.find(
          (l: IReengagementLevel) => l.level === level
        )?.cooldownDays

        if (typeof cooldownDays === 'number') {
          studentState.setCooldown(cooldownDays)
        }
      }


      studentState.lastActivityDate = ctx.lastActivity
      studentState.daysSinceLastLogin = ctx.daysInactive

      await studentState.save()
    } catch {
      // best effort (não bloquear orquestração se isto falhar)
    }
  }

  private async syncStudentStateOnRemove(
    userId: string,
    productCode: string,
    fullTag: string,
    ctx: OrchestrationContext
  ): Promise<void> {
    try {
      const code = productCode.toUpperCase()
      const studentState: any = await StudentEngagementState.findOne({ userId, productCode: code })
      if (!studentState) return

      if (typeof studentState.removeTag === 'function') {
        studentState.removeTag('RETURNED')
      }
      if (typeof studentState.markAsReturned === 'function') {
        studentState.markAsReturned()
      }

      studentState.lastActivityDate = ctx.lastActivity
      studentState.daysSinceLastLogin = ctx.daysInactive

      await studentState.save()
    } catch {
      // best effort
    }
  }

  // ─────────────────────────────────────────────────────────────
  // HELPERS (vindos do V1)
  // ─────────────────────────────────────────────────────────────

  private getUserLastActivity(user: any, productCode: string): Date {
    const byCourse = user?.communicationByCourse
    const courseData =
      typeof byCourse?.get === 'function' ? byCourse.get(productCode) : byCourse?.[productCode]

    if (courseData?.lastActivityDate) return courseData.lastActivityDate
    if (user?.lastLogin) return user.lastLogin
    return user?.createdAt || new Date()
  }

  private calculateDaysInactive(lastActivity: Date): number {
    const now = new Date()
    const diffMs = now.getTime() - lastActivity.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    return Math.max(0, diffDays)
  }

  private inferLevelFromTag(tag: string): number | undefined {
    const m = tag.match(/_(\d+)D\b/i)
    if (m?.[1]) return Number.parseInt(m[1], 10)
    const m2 = tag.match(/LEVEL[_-]?(\d+)/i)
    if (m2?.[1]) return Number.parseInt(m2[1], 10)
    return undefined
  }

  /**
   * Normaliza tags para evitar double-prefix
   * - input pode vir raw ("INATIVO_14D") ou full ("OGI_INATIVO_14D")
   * - ActiveCampaignService.applyTagToUserProduct/removeTagFromUserProduct EXPECTA raw (porque ele prefixa)
   */
  private normalizeTagForProduct(tag: string, productCode: string): { rawTag: string; fullTag: string } {
    const code = productCode.toUpperCase()
    const prefix = `${code}_`

    if (tag.toUpperCase().startsWith(prefix)) {
      return { rawTag: tag.slice(prefix.length), fullTag: tag }
    }

    return { rawTag: tag, fullTag: `${code}_${tag}` }
  }

  // ─────────────────────────────────────────────────────────────
  // MÉTODOS PÚBLICOS (extras do V1)
  // ─────────────────────────────────────────────────────────────

  /**
   * Executar múltiplas orquestrações (equivalente ao executeMultipleDecisions do V1)
   */
  async orchestrateMultipleUserProducts(
    items: Array<{ userId: string; productId: string }>
  ): Promise<OrchestrationResult[]> {
    const results: OrchestrationResult[] = []

    for (const item of items) {
      try {
        const r = await this.orchestrateUserProduct(item.userId, item.productId)
        results.push(r)
      } catch (error: any) {
        results.push({
          userId: item.userId,
          productId: item.productId,
          productCode: '',
          tagsApplied: [],
          tagsRemoved: [],
          communicationsTriggered: 0,
          success: false,
          error: error.message
        })
      }
    }

    return results
  }

  /**
   * Estatísticas de execução (equivalente ao getExecutionStats do V1)
   */
  getExecutionStats(results: OrchestrationResult[]): any {
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
    console.log(`[TagOrchestrator V2] Orquestrando todos os produtos do user ${userId}`)

    const userProducts = await UserProduct.find({ userId })
    const results: OrchestrationResult[] = []

    for (const up of userProducts) {
      const r = await this.orchestrateUserProduct(userId, up.productId.toString())
      results.push(r)
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
      const r = await this.orchestrateUserProduct(up.userId.toString(), productId)
      results.push(r)
    }

    const totalSuccess = results.filter(r => r.success).length
    console.log(`[TagOrchestrator V2] ✅ Orquestração completa: ${totalSuccess}/${results.length} sucesso`)

    return results
  }

  /**
   * Executar operação em batch (com rate limiting)
   */
  async executeBatchOperation(operations: TagOperation[], rateLimit: number = 5): Promise<number> {
    console.log(`[TagOrchestrator V2] Executando ${operations.length} operações em batch`)

    let successCount = 0
    let currentBatch: TagOperation[] = []

    for (let i = 0; i < operations.length; i++) {
      currentBatch.push(operations[i])

      if (currentBatch.length === rateLimit || i === operations.length - 1) {
        const promises = currentBatch.map(async (op) => {
          const user = await User.findById(op.userId)
          const product = await Product.findById(op.productId)
          if (!user || !product) return false

          const productCode = String(product.code || '').toUpperCase()
          const ctx: OrchestrationContext = {
            user,
            product,
            lastActivity: this.getUserLastActivity(user, productCode),
            daysInactive: this.calculateDaysInactive(this.getUserLastActivity(user, productCode))
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

    console.log(`[TagOrchestrator V2] ✅ Batch completo: ${successCount}/${operations.length} sucesso`)
    return successCount
  }

  /**
   * Cleanup: Remover tags órfãs (não mais válidas)
   */
  async cleanupOrphanTags(userId: string, productId: string): Promise<string[]> {
    console.log(`[TagOrchestrator V2] Limpando tags órfãs para userId=${userId}, productId=${productId}`)

    const userProduct = await UserProduct.findOne({ userId, productId })
    const user = await User.findById(userId)
    const product = await Product.findById(productId)

    if (!userProduct || !user || !product) return []

    const productCode = String(product.code || '').toUpperCase()
    const currentTags = userProduct.activeCampaignData?.tags || []
    const tagsToRemove: string[] = []

    for (const t of currentTags) {
      if (!String(t).toUpperCase().startsWith(productCode + '_')) {
        tagsToRemove.push(t)
      }
    }

    const ctx: OrchestrationContext = {
      user,
      product,
      lastActivity: this.getUserLastActivity(user, productCode),
      daysInactive: this.calculateDaysInactive(this.getUserLastActivity(user, productCode))
    }

    for (const t of tagsToRemove) {
      await this.removeTag(userId, productId, t, ctx)
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
