// ════════════════════════════════════════════════════════════
// 📁 src/jobs/dailyPipeline/tagEvaluation/positiveTags.ts
// Avaliação de Tags Positivas (Ativo, Super Utilizador)
// ════════════════════════════════════════════════════════════

import { IUserProductForEvaluation, ProductName } from './types'
import { calculateEngagementScore } from './engagementScore'
import { formatBOTag } from './tagFormatter'

/**
 * Avalia e retorna tags positivas baseado em atividade e engagement
 *
 * Regras (não-mutuamente exclusivas):
 * - Ativo: acedeu nos últimos 3 dias (daysInactive <= 3)
 * - Super Utilizador: engagement score >= 85
 *
 * Nota: Usa campos diferentes por plataforma:
 * - OGI: daysSinceLastLogin (baseado em login)
 * - CLAREZA: daysSinceLastAction (baseado em lastAction)
 *
 * @param userProduct - UserProduct com dados de engagement
 * @param productName - Nome do produto (OGI_V1, CLAREZA_ANUAL, etc.)
 * @returns Array com 0, 1 ou 2 tags positivas
 */
export function evaluatePositiveTags(
  userProduct: IUserProductForEvaluation,
  productName: ProductName
): string[] {
  const tags: string[] = []

  // ─────────────────────────────────────────────────────────────
  // DETERMINAR DIAS DE INATIVIDADE (depende da plataforma)
  // ─────────────────────────────────────────────────────────────

  // OGI usa daysSinceLastLogin, CLAREZA usa daysSinceLastAction
  const isOGI = productName.includes('OGI')
  const daysInactive = isOGI
    ? (userProduct.engagement?.daysSinceLastLogin ?? 999)
    : (userProduct.engagement?.daysSinceLastAction ?? 999)

  // ─────────────────────────────────────────────────────────────
  // TAG 1: ATIVO (acedeu nos últimos 3 dias)
  // ─────────────────────────────────────────────────────────────

  if (daysInactive <= 3) {
    tags.push(formatBOTag(productName, 'Ativo'))
  }

  // ─────────────────────────────────────────────────────────────
  // TAG 2: SUPER UTILIZADOR (engagement score >= 85)
  // ─────────────────────────────────────────────────────────────

  const engagementScore = calculateEngagementScore(userProduct, productName)

  if (engagementScore >= 85) {
    tags.push(formatBOTag(productName, 'Super Utilizador'))
  }

  return tags
}

/**
 * Retorna tags positivas com informação de debug
 */
export function evaluatePositiveTagsWithDebug(
  userProduct: IUserProductForEvaluation,
  productName: ProductName
): {
  tags: string[]
  reason: string
  daysInactive: number
  engagementScore: number
} {
  const isOGI = productName.includes('OGI')
  const daysInactive = isOGI
    ? (userProduct.engagement?.daysSinceLastLogin ?? 999)
    : (userProduct.engagement?.daysSinceLastAction ?? 999)

  const engagementScore = calculateEngagementScore(userProduct, productName)
  const tags = evaluatePositiveTags(userProduct, productName)

  let reason = ''
  if (tags.length === 0) {
    reason = `Sem tags positivas (inativo ${daysInactive}d, score=${engagementScore})`
  } else {
    reason = `Tags: ${tags.join(', ')} (inativo ${daysInactive}d, score=${engagementScore})`
  }

  return { tags, reason, daysInactive, engagementScore }
}
