// ════════════════════════════════════════════════════════════
// 📁 src/jobs/dailyPipeline/tagEvaluation/inactivityTags.ts
// Avaliação de Tags de Inatividade
// ════════════════════════════════════════════════════════════

import { IUserProductForEvaluation, ProductName } from './types'
import { formatBOTag } from './tagFormatter'

/**
 * Avalia e retorna tags de inatividade baseado em dias sem acesso
 *
 * Regras (prioridade descendente):
 * - >= 30 dias → "Inativo 30d"
 * - >= 21 dias → "Inativo 21d"
 * - >= 14 dias → "Inativo 14d"
 * - >= 10 dias → "Inativo 10d" (OGI apenas)
 * - >= 7 dias → "Inativo 7d" (Clareza apenas)
 * - < 7/10 dias → Sem tag (aluno ativo)
 *
 * Nota: OGI começa inatividade em 10d, Clareza em 7d
 *
 * @param userProduct - UserProduct com dados de engagement
 * @param productName - Nome do produto (OGI_V1, CLAREZA_ANUAL, etc.)
 * @returns Array com 0 ou 1 tag de inatividade
 */
export function evaluateInactivityTags(
  userProduct: IUserProductForEvaluation,
  productName: ProductName
): string[] {
  const tags: string[] = []

  // Verificar se é produto OGI
  const isOGI = productName.includes('OGI')

  // Obter dias de inatividade (usar campo específico da plataforma se disponível)
  const daysInactive = userProduct.engagement?.daysInactive ??
                        (isOGI
                          ? (userProduct.engagement?.daysSinceLastLogin ?? 0)
                          : (userProduct.engagement?.daysSinceLastAction ?? 0))

  // ─────────────────────────────────────────────────────────────
  // AVALIAÇÃO EM ORDEM DE PRIORIDADE (do maior para o menor)
  // ─────────────────────────────────────────────────────────────

  if (daysInactive >= 30) {
    tags.push(formatBOTag(productName, 'Inativo 30d'))
  } else if (daysInactive >= 21) {
    tags.push(formatBOTag(productName, 'Inativo 21d'))
  } else if (daysInactive >= 14) {
    tags.push(formatBOTag(productName, 'Inativo 14d'))
  } else if (isOGI && daysInactive >= 10) {
    // OGI: threshold de 10 dias
    tags.push(formatBOTag(productName, 'Inativo 10d'))
  } else if (!isOGI && daysInactive >= 7) {
    // CLAREZA: threshold de 7 dias
    tags.push(formatBOTag(productName, 'Inativo 7d'))
  }
  // Se < 7 dias (Clareza) ou < 10 dias (OGI), não aplica tag de inatividade

  return tags
}

/**
 * Retorna a tag de inatividade com informação de debug
 */
export function evaluateInactivityTagsWithDebug(
  userProduct: IUserProductForEvaluation,
  productName: ProductName
): {
  tags: string[]
  reason: string
  daysInactive: number
} {
  const isOGI = productName.includes('OGI')

  // Obter dias de inatividade (usar campo específico da plataforma se disponível)
  const daysInactive = userProduct.engagement?.daysInactive ??
                        (isOGI
                          ? (userProduct.engagement?.daysSinceLastLogin ?? 0)
                          : (userProduct.engagement?.daysSinceLastAction ?? 0))

  const tags = evaluateInactivityTags(userProduct, productName)

  let reason = ''
  if (daysInactive >= 30) {
    reason = `Inativo há ${daysInactive} dias (>= 30d)`
  } else if (daysInactive >= 21) {
    reason = `Inativo há ${daysInactive} dias (>= 21d)`
  } else if (daysInactive >= 14) {
    reason = `Inativo há ${daysInactive} dias (>= 14d)`
  } else if (isOGI && daysInactive >= 10) {
    reason = `Inativo há ${daysInactive} dias (>= 10d - OGI)`
  } else if (!isOGI && daysInactive >= 7) {
    reason = `Inativo há ${daysInactive} dias (>= 7d - CLAREZA)`
  } else {
    reason = `Ativo (${daysInactive} dias desde último acesso)`
  }

  return { tags, reason, daysInactive }
}
