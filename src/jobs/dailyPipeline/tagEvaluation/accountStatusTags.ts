// ════════════════════════════════════════════════════════════
// 📁 src/jobs/dailyPipeline/tagEvaluation/accountStatusTags.ts
// Avaliação de Tags de Estado da Conta
// ════════════════════════════════════════════════════════════

import { IUserProductForEvaluation, IUserForEvaluation, ProductName } from './types'
import { formatBOTag } from './tagFormatter'

/**
 * Avalia e retorna tags de estado da conta (cancelado, reembolsado, suspenso, etc.)
 *
 * Regras (não mutuamente exclusivas):
 *
 * CRITICAL:
 * - Cancelado: userProduct.status === 'CANCELLED'
 * - Reembolsado: userProduct.metadata.refunded === true
 * - Inativado Manualmente: user.inactivation.isManuallyInactivated === true (só OGI)
 *
 * WARNING:
 * - Suspenso: userProduct.status === 'SUSPENDED'
 * - Inativo Curseduca: userProduct.curseduca.memberStatus === 'INACTIVE' (só CLAREZA)
 *
 * GOOD:
 * - Reativado: userProduct.reactivatedAt nos últimos 7 dias
 *
 * @param userProduct - UserProduct com dados de status e metadata
 * @param user - User com dados de inativação manual
 * @param productName - Nome do produto (OGI_V1, CLAREZA_ANUAL, CLAREZA_MENSAL)
 * @returns Array com 0+ tags de estado da conta
 */
export function evaluateAccountStatusTags(
  userProduct: IUserProductForEvaluation,
  user: IUserForEvaluation | null,
  productName: ProductName
): string[] {
  const tags: string[] = []

  // ─────────────────────────────────────────────────────────────
  // 🔴 CRITICAL - Status negativos
  // ─────────────────────────────────────────────────────────────

  // Cancelado
  if (userProduct.status === 'CANCELLED') {
    tags.push(formatBOTag(productName, 'Cancelado'))
  }

  // Reembolsado
  if (userProduct.metadata?.refunded === true) {
    tags.push(formatBOTag(productName, 'Reembolsado'))
  }

  // Inativado Manualmente (apenas OGI)
  if (productName.includes('OGI') && user?.inactivation?.isManuallyInactivated === true) {
    tags.push(formatBOTag(productName, 'Inativado Manualmente'))
  }

  // ─────────────────────────────────────────────────────────────
  // ⚠️ WARNING - Status atenção
  // ─────────────────────────────────────────────────────────────

  // Suspenso
  if (userProduct.status === 'SUSPENDED') {
    tags.push(formatBOTag(productName, 'Suspenso'))
  }

  // Inativo Curseduca (apenas CLAREZA)
  const isClarezaProduct = productName.includes('CLAREZA')
  if (isClarezaProduct && userProduct.curseduca?.memberStatus === 'INACTIVE') {
    tags.push(formatBOTag(productName, 'Inativo Curseduca'))
  }

  // ─────────────────────────────────────────────────────────────
  // 🟢 GOOD - Status positivos
  // ─────────────────────────────────────────────────────────────

  // Reativado (nos últimos 7 dias)
  if (userProduct.reactivatedAt) {
    const daysSinceReactivation = Math.floor(
      (Date.now() - new Date(userProduct.reactivatedAt).getTime()) / (1000 * 60 * 60 * 24)
    )

    if (daysSinceReactivation <= 7) {
      tags.push(formatBOTag(productName, 'Reativado'))
    }
  }

  return tags
}

/**
 * Retorna as tags de estado da conta com informação de debug
 */
export function evaluateAccountStatusTagsWithDebug(
  userProduct: IUserProductForEvaluation,
  user: IUserForEvaluation | null,
  productName: ProductName
): {
  tags: string[]
  reason: string
  statusDetails: {
    status: string
    isRefunded: boolean
    isManuallyInactivated: boolean
    isSuspended: boolean
    isCursEducaInactive: boolean
    isRecentlyReactivated: boolean
    daysSinceReactivation?: number
  }
} {
  const tags = evaluateAccountStatusTags(userProduct, user, productName)

  const isRefunded = userProduct.metadata?.refunded === true
  const isManuallyInactivated = user?.inactivation?.isManuallyInactivated === true
  const isSuspended = userProduct.status === 'SUSPENDED'
  const isCursEducaInactive = userProduct.curseduca?.memberStatus === 'INACTIVE'

  let daysSinceReactivation: number | undefined = undefined
  let isRecentlyReactivated = false

  if (userProduct.reactivatedAt) {
    daysSinceReactivation = Math.floor(
      (Date.now() - new Date(userProduct.reactivatedAt).getTime()) / (1000 * 60 * 60 * 24)
    )
    isRecentlyReactivated = daysSinceReactivation <= 7
  }

  const reasons: string[] = []
  if (userProduct.status === 'CANCELLED') reasons.push('Status: CANCELLED')
  if (isRefunded) reasons.push('Reembolsado')
  if (isManuallyInactivated) reasons.push('Inativado manualmente')
  if (isSuspended) reasons.push('Suspenso')
  if (isCursEducaInactive) reasons.push('Inativo no CursEduca')
  if (isRecentlyReactivated) reasons.push(`Reativado há ${daysSinceReactivation} dias`)

  if (reasons.length === 0) {
    reasons.push(`Status: ${userProduct.status} (sem tags especiais)`)
  }

  return {
    tags,
    reason: reasons.join(' | '),
    statusDetails: {
      status: userProduct.status,
      isRefunded,
      isManuallyInactivated,
      isSuspended,
      isCursEducaInactive,
      isRecentlyReactivated,
      daysSinceReactivation
    }
  }
}
