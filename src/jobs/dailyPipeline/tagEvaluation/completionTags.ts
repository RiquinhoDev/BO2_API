// ════════════════════════════════════════════════════════════
// 📁 src/jobs/dailyPipeline/tagEvaluation/completionTags.ts
// Avaliação de Tags de Conclusão
// ════════════════════════════════════════════════════════════

import { IUserProductForEvaluation, ProductName } from './types'
import { formatBOTag } from './tagFormatter'

/**
 * Avalia e retorna tags de conclusão baseado em progresso e consistência
 *
 * Regras (não mutuamente exclusivas):
 * 1. Curso Concluído: progress === 100%
 * 2. Aluno Consistente: acessa pelo menos 1x por semana (4+ semanas ativas nos últimos 30 dias)
 *
 * @param userProduct - UserProduct com dados de progress e engagement
 * @param productName - Nome do produto (OGI_V1, CLAREZA_ANUAL, etc.)
 * @returns Array com 0, 1 ou 2 tags de conclusão
 */
export function evaluateCompletionTags(
  userProduct: IUserProductForEvaluation,
  productName: ProductName
): string[] {
  const tags: string[] = []

  // ─────────────────────────────────────────────────────────────
  // 1️⃣ CURSO CONCLUÍDO (100%)
  // ─────────────────────────────────────────────────────────────
  const progress = userProduct.progress?.percentage ?? 0

  if (progress === 100) {
    tags.push(formatBOTag(productName, 'Curso Concluído'))
  }

  // ─────────────────────────────────────────────────────────────
  // 2️⃣ ALUNO CONSISTENTE (4+ semanas ativas nos últimos 30 dias)
  // ─────────────────────────────────────────────────────────────
  const weeksActive = userProduct.engagement?.weeksActiveLast30Days ?? 0

  if (weeksActive >= 4) {
    tags.push(formatBOTag(productName, 'Aluno Consistente'))
  }

  return tags
}

/**
 * Retorna as tags de conclusão com informação de debug
 */
export function evaluateCompletionTagsWithDebug(
  userProduct: IUserProductForEvaluation,
  productName: ProductName
): {
  tags: string[]
  reason: string
  progress: number
  weeksActive: number
  isCourseCompleted: boolean
  isConsistentStudent: boolean
} {
  const progress = userProduct.progress?.percentage ?? 0
  const weeksActive = userProduct.engagement?.weeksActiveLast30Days ?? 0
  const tags = evaluateCompletionTags(userProduct, productName)

  const isCourseCompleted = progress === 100
  const isConsistentStudent = weeksActive >= 4

  const reasons: string[] = []
  if (isCourseCompleted) {
    reasons.push('Curso 100% concluído')
  }
  if (isConsistentStudent) {
    reasons.push(`Consistente (${weeksActive} semanas ativas nos últimos 30 dias)`)
  }
  if (reasons.length === 0) {
    reasons.push(`Progresso ${progress}%, ${weeksActive} semanas ativas (insuficiente para tags de conclusão)`)
  }

  return {
    tags,
    reason: reasons.join(' | '),
    progress,
    weeksActive,
    isCourseCompleted,
    isConsistentStudent
  }
}
