// ════════════════════════════════════════════════════════════
// 📁 src/jobs/dailyPipeline/tagEvaluation/globalUserTags.ts
// Avaliação de Tags Globais (cross-produto, nível de utilizador)
// ════════════════════════════════════════════════════════════

import { IUserProductForEvaluation } from './types'

/**
 * Avalia e retorna tags globais aplicadas ao UTILIZADOR (não ao produto)
 *
 * Regra: "Aluno Inativo" (global)
 * - TODOS os produtos do utilizador estão CANCELLED ou INACTIVE
 * - Utilizador tem pelo menos 1 produto
 *
 * Nota: Esta tag é diferente das outras - é aplicada ao USER, não ao UserProduct
 *
 * @param userProducts - Array de UserProducts do mesmo utilizador
 * @returns Array com 0 ou 1 tag global
 */
export function evaluateGlobalUserTags(
  userProducts: IUserProductForEvaluation[]
): string[] {
  const tags: string[] = []

  // ─────────────────────────────────────────────────────────────
  // VERIFICAÇÃO 1: Utilizador tem produtos?
  // ─────────────────────────────────────────────────────────────

  if (userProducts.length === 0) {
    return tags // Sem produtos, sem tag
  }

  // ─────────────────────────────────────────────────────────────
  // VERIFICAÇÃO 2: TODOS os produtos cancelados/inativos?
  // ─────────────────────────────────────────────────────────────

  const allCancelledOrInactive = userProducts.every(up => {
    const status = up.status?.toUpperCase()
    return status === 'CANCELLED' || status === 'INACTIVE'
  })

  if (allCancelledOrInactive) {
    tags.push('BO_GLOBAL - Aluno Inativo')
  }

  return tags
}

/**
 * Retorna tags globais com informação de debug
 */
export function evaluateGlobalUserTagsWithDebug(
  userProducts: IUserProductForEvaluation[]
): {
  tags: string[]
  reason: string
  totalProducts: number
  cancelledCount: number
  activeCount: number
  statusBreakdown: Record<string, number>
} {
  const tags = evaluateGlobalUserTags(userProducts)

  const totalProducts = userProducts.length

  // Contar por status
  const statusBreakdown: Record<string, number> = {}
  let cancelledCount = 0
  let activeCount = 0

  for (const up of userProducts) {
    const status = up.status?.toUpperCase() || 'UNKNOWN'
    statusBreakdown[status] = (statusBreakdown[status] || 0) + 1

    if (status === 'CANCELLED' || status === 'INACTIVE') {
      cancelledCount++
    } else if (status === 'ACTIVE') {
      activeCount++
    }
  }

  let reason = ''
  if (totalProducts === 0) {
    reason = 'Utilizador sem produtos'
  } else if (tags.length > 0) {
    reason = `TODOS os ${totalProducts} produtos cancelados/inativos`
  } else {
    reason = `${activeCount} produtos ativos de ${totalProducts} total`
  }

  return {
    tags,
    reason,
    totalProducts,
    cancelledCount,
    activeCount,
    statusBreakdown
  }
}
