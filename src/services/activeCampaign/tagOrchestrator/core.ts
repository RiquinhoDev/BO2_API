import logger from '../../../utils/logger'
import UserProduct from '../../../models/UserProduct'
import Product from '../../../models/product/Product'
import User from '../../../models/user'
import activeCampaignService from '../activeCampaignService'
import CommunicationHistory from '../../../models/acTags/CommunicationHistory'
import ProductProfile, { IProductProfile, IReengagementLevel } from '../../../models/product/ProductProfile'
import StudentEngagementState from '../../../models/StudentEngagementState'
import decisionEngine from '../decisionEngine.service'
import { getLastLearnerActivityDate } from '../../activity/learnerActivity'
import nativeTagProtection from '../nativeTagProtection.service'
import {
  errorMessage,
  isBOTag,
  OrchestrationContext,
  OrchestrationResult
} from './contracts'
export class TagOrchestratorCore {
  /**
   * Orquestrar tags para um UserProduct específico
   */
async orchestrateUserProduct(userId: string, productId: string): Promise<OrchestrationResult> {
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
    const userProduct = await UserProduct.findOne({ userId, productId })
    const user = await User.findById(userId)
    const product = await Product.findById(productId)

    if (!userProduct || !user || !product) {
      throw new Error('UserProduct, User ou Product não encontrado')
    }

    const productCode = String(product.code || '').toUpperCase()
    result.productCode = productCode

    const lastActivity = getLastLearnerActivityDate(user, product.code)
    const daysInactive = this.calculateDaysInactive(lastActivity)

    const ctx: OrchestrationContext = {
      productCode,
      lastActivity,
      daysInactive,
    }

    // ═══════════════════════════════════════════════════════════
    // 1) 🛡️ CAPTURAR TAGS NATIVAS (PROTEÇÃO)
    // ═══════════════════════════════════════════════════════════

    if (user.email) {
      try {
        await nativeTagProtection.captureNativeTags(
          user.email,
          `TAG_ORCHESTRATOR_${productCode}`
        )
      } catch (error: unknown) {
        logger.error(`[Orchestrator] ⚠️  Erro ao capturar tags nativas para ${user.email}:`, errorMessage(error))
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 2) DECISÕES - CHAMAR DECISION ENGINE
    // ═══════════════════════════════════════════════════════════

    const decisions = await decisionEngine.evaluateUserProduct(userId, productId)

    // ═══════════════════════════════════════════════════════════
    // 3) ✅ DIFF INTELIGENTE COM SYNC DO ACTIVE CAMPAIGN
    //    🔧 CORREÇÃO: SÓ VER TAGS DO PRODUTO ATUAL!
    // ═══════════════════════════════════════════════════════════

    // Buscar tags REAIS do Active Campaign
    const acTags = await activeCampaignService.getContactTagsByEmail(user.email)

    // Determinar prefixos ESPECÍFICOS deste produto
    const productTagPrefixes = this.getProductTagPrefixes(productCode)

    // Filtrar SÓ tags DESTE PRODUTO no AC
    const currentProductTagsInAC = acTags.filter((tag: string) =>
      productTagPrefixes.some(prefix => tag.toUpperCase().startsWith(prefix))
    )

    // Tags novas (do decision engine)
    const newBOTags = (decisions.tagsToApply || []).map((tag: string) => {
      const { fullTag } = this.normalizeTagForProduct(tag)
      return fullTag
    })

    // DIFF: Comparar tags DESTE PRODUTO no AC com esperadas
    // FILTRO CRÍTICO: Apenas tags BO podem ser removidas! (protege tags nativas)
    const tagsToRemoveCandidates = currentProductTagsInAC
      .filter((tag: string) => isBOTag(tag))
      .filter((tag: string) => !newBOTags.includes(tag))
    const tagsToAdd = newBOTags.filter((tag: string) => !currentProductTagsInAC.includes(tag))

    // ═══════════════════════════════════════════════════════════
    // 🛡️ PROTEÇÃO TRIPLA: Filtrar tags seguras para remover
    // ═══════════════════════════════════════════════════════════

    let tagsToRemove: string[] = []

    if (user.email && tagsToRemoveCandidates.length > 0) {
      const filtered = await nativeTagProtection.filterSafeTagsToRemove(
        user.email,
        tagsToRemoveCandidates
      )

      tagsToRemove = filtered.safeTags

      if (filtered.blockedTags.length > 0) {
        logger.error(`[Orchestrator] 🚨 BLOQUEADAS ${filtered.blockedTags.length} tags nativas para ${user.email}:`, filtered.blockedTags)
        logger.error(`[Orchestrator] Motivos:`, filtered.reasons)
      }
    } else {
      tagsToRemove = tagsToRemoveCandidates
    }

    // ═══════════════════════════════════════════════════════════
    // 4) REMOVER TAGS DESATUALIZADAS (só deste produto!)
    // ═══════════════════════════════════════════════════════════

    let removeFailed = false
    for (const tag of tagsToRemove) {
      const removed = await this.removeTag(userId, productId, tag, ctx)
      if (removed.ok) {
        result.tagsRemoved.push(removed.fullTag)
      } else {
        removeFailed = true
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 5) APLICAR TAGS NOVAS
    // ═══════════════════════════════════════════════════════════
    
    let applyFailed = false
    for (const tag of tagsToAdd) {
      const applied = await this.applyTag(userId, productId, tag, ctx)
      if (applied.ok) {
        result.tagsApplied.push(applied.fullTag)
      } else {
        applyFailed = true
      }
    }

    const desiredTags = Array.from(new Set(newBOTags))
    const hasDecisionErrors = Array.isArray(decisions.errors) && decisions.errors.length > 0
    const canPersistTags = !hasDecisionErrors && !applyFailed && !removeFailed

    if (canPersistTags) {
      await UserProduct.findByIdAndUpdate(userProduct._id, {
        $set: {
          'activeCampaignData.tags': desiredTags,
          'activeCampaignData.lastSyncAt': new Date()
        }
      })
    }

    // ═══════════════════════════════════════════════════════════
    // 6) HISTÓRICO DE COMUNICAÇÕES
    // ═══════════════════════════════════════════════════════════

    if (result.tagsApplied.length > 0 || result.tagsRemoved.length > 0) {
      await this.logCommunication(userId, productId, result, ctx)
      result.communicationsTriggered = 1
    }

    result.success = true

  } catch (error: unknown) {
    const message = errorMessage(error)
    result.success = false
    result.error = message
    logger.error(`❌ [Orchestrator] Erro ${result.productCode || 'unknown'}:`, message)
  }

  return result
}

private getProductTagPrefixes(productCode: string): string[] {
  const code = productCode.toUpperCase()
  
  // ✅ CLAREZA: Produtos CLAREZA têm vários formatos devido a migrações
  if (code.includes('CLAREZA')) {
    return [
      'CLAREZA -',        // Formato novo correto
      'CLAREZA-',         // Variação sem espaço
      'CLAREZA_MENSAL',   // Formato antigo (tags órfãs)
      'CLAREZA_ANUAL'     // Formato antigo (tags órfãs)
    ]
  }
  
  // ✅ OGI: Produtos OGI
  if (code.includes('OGI')) {
    return [
      'OGI_V1',           // Formato atual
      'OGI -'             // Se houver variação
    ]
  }
  
  // ✅ DISCORD
  if (code.includes('DISCORD')) {
    return ['DISCORD_COMMUNITY']
  }
  
  // ✅ Default: Usar o código do produto como está
  return [code]
}

  // ─────────────────────────────────────────────────────────────
  // APPLY / REMOVE (com normalização + sync StudentEngagementState)
  // ─────────────────────────────────────────────────────────────

  protected async applyTag(
    userId: string,
    productId: string,
    tag: string,
    ctx: OrchestrationContext
  ): Promise<{ ok: boolean; fullTag: string }> {
    const productCode = ctx.productCode
    const { rawTag, fullTag } = this.normalizeTagForProduct(tag)

    try {
      const ok = await activeCampaignService.applyTagToUserProduct(userId, productId, rawTag)
      if (!ok) return { ok: false, fullTag }

      const level = this.inferLevelFromTag(fullTag)

      // Sync opcional do StudentEngagementState
      await this.syncStudentStateOnApply(userId, productCode, fullTag, level, ctx)

      return { ok: true, fullTag }
    } catch (error: unknown) {
      logger.error(`❌ [Orchestrator] Erro ao aplicar ${fullTag}:`, errorMessage(error))
      return { ok: false, fullTag }
    }
  }

  protected async removeTag(
    userId: string,
    productId: string,
    tag: string,
    ctx: OrchestrationContext
  ): Promise<{ ok: boolean; fullTag: string }> {
    const productCode = ctx.productCode
    const { rawTag, fullTag } = this.normalizeTagForProduct(tag)

    try {
      const ok = await activeCampaignService.removeTagFromUserProduct(userId, productId, rawTag)
      if (!ok) return { ok: false, fullTag }

      // Sync opcional do StudentEngagementState
      await this.syncStudentStateOnRemove(userId, productCode, fullTag, ctx)

      // Atualizar última comunicação como "returned/success"
      await this.markLastCommunicationAsReturned(userId, productId, fullTag)

      return { ok: true, fullTag }
    } catch (error: unknown) {
      logger.error(`❌ [Orchestrator] Erro ao remover ${fullTag}:`, errorMessage(error))
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
         tagApplied: result.tagsApplied[0] || 'UNKNOWN',
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
          lastActivity: ctx.lastActivity,
          daysInactive: ctx.daysInactive
        }
      })
    } catch {
      // Silent fail - não bloquear orquestração
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
      let studentState = await StudentEngagementState.findOne({ userId, productCode: code })

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
      const studentState = await StudentEngagementState.findOne({ userId, productCode: code })
      if (!studentState) return

      if (typeof studentState.removeTag === 'function') {
        studentState.removeTag('RETURNED')
      }
      if (typeof studentState.markAsReturned === 'function') {
        studentState.markAsReturned()
      }

      studentState.daysSinceLastLogin = ctx.daysInactive

      await studentState.save()
    } catch {
      // best effort
    }
  }

  // ─────────────────────────────────────────────────────────────
  // HELPERS (vindos do V1)
  // ─────────────────────────────────────────────────────────────

  protected calculateDaysInactive(lastActivity: Date | null): number | null {
    // Sem sinal de actividade = desconhecido, NÃO inactivo (mesma semântica do decisionEngine).
    if (!lastActivity) return null
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
private normalizeTagForProduct(tag: string): { rawTag: string; fullTag: string } {
  // ✅ As tags JÁ vêm com o prefixo correto do adapter (ex: "OGI_V1 - Inativo 7d")
  // O activeCampaignService NÃO adiciona mais prefixo
  // Então simplesmente retornamos a tag como está
  
  return {
    rawTag: tag,    // Tag completa para ActiveCampaign
    fullTag: tag    // Tag completa para logging
  }
}

  // ─────────────────────────────────────────────────────────────
  // MÉTODOS PÚBLICOS (extras do V1)
  // ─────────────────────────────────────────────────────────────

  /**
   * Executar múltiplas orquestrações (equivalente ao executeMultipleDecisions do V1)
   */
}
