// ════════════════════════════════════════════════════════════
// 📁 src/jobs/dailyPipeline/tagEvaluation/engagementTags.ts
// Avaliação de Tags de Engagement
// ════════════════════════════════════════════════════════════

import { IUserProductForEvaluation, ProductName } from './types'
import { calculateEngagementScore } from './engagementScore'
import { formatBOTag } from './tagFormatter'

/**
 * Avalia e retorna tags de engagement baseado no engagement score
 *
 * Regras (mutuamente exclusivas):
 * - < 15 → "Engajamento Crítico"
 * - 15-29 → "Baixo Engajamento"
 * - 30-49 → "Médio-Baixo Engajamento"
 * - 50-69 → "Médio Engajamento"
 * - 70-84 → "Alto Engajamento"
 * - >= 85 → "Engajamento Excepcional"
 *
 * @param userProduct - UserProduct com dados de engagement e progress
 * @param productName - Nome do produto (OGI_V1, CLAREZA_ANUAL, etc.)
 * @returns Array com 1 tag de engagement
 */
export function evaluateEngagementTags(
  userProduct: IUserProductForEvaluation,
  productName: ProductName
): string[] {
  const tags: string[] = []

  // Calcular engagement score
  const score = calculateEngagementScore(userProduct, productName)

  // ─────────────────────────────────────────────────────────────
  // AVALIAÇÃO BASEADA NO SCORE
  // ─────────────────────────────────────────────────────────────

  if (score < 15) {
    tags.push(formatBOTag(productName, 'Engajamento Crítico'))
  } else if (score < 30) {
    tags.push(formatBOTag(productName, 'Baixo Engajamento'))
  } else if (score < 50) {
    tags.push(formatBOTag(productName, 'Médio-Baixo Engajamento'))
  } else if (score < 70) {
    tags.push(formatBOTag(productName, 'Médio Engajamento'))
  } else if (score < 85) {
    tags.push(formatBOTag(productName, 'Alto Engajamento'))
  } else {
    tags.push(formatBOTag(productName, 'Engajamento Excepcional'))
  }

  return tags
}

/**
 * Retorna a tag de engagement com informação de debug
 */
export function evaluateEngagementTagsWithDebug(
  userProduct: IUserProductForEvaluation,
  productName: ProductName
): {
  tags: string[]
  reason: string
  score: number
  breakdown: {
    frequency: number
    progress: number
    consistency: number
  }
} {
  const score = calculateEngagementScore(userProduct, productName)
  const tags = evaluateEngagementTags(userProduct, productName)

  // Calcular breakdown para debug
  const daysInactive = userProduct.engagement?.daysInactive ?? 999
  const progress = userProduct.progress?.percentage ?? 0
  const logins30d = userProduct.engagement?.loginsLast30Days ?? 0

  let frequencyScore = 0
  if (daysInactive === 0) frequencyScore = 40
  else if (daysInactive <= 3) frequencyScore = 30
  else if (daysInactive <= 7) frequencyScore = 20
  else if (daysInactive <= 14) frequencyScore = 10

  const progressScore = Math.round((progress / 100) * 30)

  let consistencyScore = 0
  if (logins30d >= 20) consistencyScore = 30
  else if (logins30d >= 10) consistencyScore = 20
  else if (logins30d >= 5) consistencyScore = 10

  const reason = `Engagement score: ${score}/100 (freq=${frequencyScore}, prog=${progressScore}, cons=${consistencyScore})`

  return {
    tags,
    reason,
    score,
    breakdown: {
      frequency: frequencyScore,
      progress: progressScore,
      consistency: consistencyScore
    }
  }
}
