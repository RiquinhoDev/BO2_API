// ════════════════════════════════════════════════════════════
// 📁 src/jobs/dailyPipeline/tagEvaluation/progressTags.ts
// Avaliação de Tags de Progresso
// ════════════════════════════════════════════════════════════

import { IUserProductForEvaluation, ProductName } from './types'
import { formatBOTag } from './tagFormatter'

/**
 * Avalia e retorna tags de progresso baseado na percentagem de conclusão
 *
 * Regras SIMPLIFICADAS (mutuamente exclusivas - 5 níveis):
 * - 0% → "Não Iniciou"
 * - 1-20% → "Início Abandonado"
 * - 21-50% → "Progresso Baixo"
 * - 51-90% → "Progresso Alto"
 * - 91-99% → "Quase Completo"
 * - 100% → "Curso Concluído" (aplicado em COMPLETION, não aqui)
 *
 * @param userProduct - UserProduct com dados de progress
 * @param productName - Nome do produto (OGI_V1, CLAREZA_ANUAL, etc.)
 * @returns Array com 0 ou 1 tag de progresso
 */
export function evaluateProgressTags(
  userProduct: IUserProductForEvaluation,
  productName: ProductName
): string[] {
  const tags: string[] = []

  // Obter percentagem de progresso
  const progress = userProduct.progress?.percentage ?? 0

  // ─────────────────────────────────────────────────────────────
  // AVALIAÇÃO BASEADA NA PERCENTAGEM (5 NÍVEIS SIMPLIFICADOS)
  // ─────────────────────────────────────────────────────────────

  if (progress === 0) {
    tags.push(formatBOTag(productName, 'Não Iniciou'))
  } else if (progress > 0 && progress <= 20) {
    tags.push(formatBOTag(productName, 'Início Abandonado'))
  } else if (progress > 20 && progress <= 50) {
    tags.push(formatBOTag(productName, 'Progresso Baixo'))
  } else if (progress > 50 && progress <= 90) {
    tags.push(formatBOTag(productName, 'Progresso Alto'))
  } else if (progress > 90 && progress < 100) {
    tags.push(formatBOTag(productName, 'Quase Completo'))
  }
  // Se progress === 100, não aplica tag aqui (é aplicada em COMPLETION)

  return tags
}

/**
 * Retorna a tag de progresso com informação de debug
 */
export function evaluateProgressTagsWithDebug(
  userProduct: IUserProductForEvaluation,
  productName: ProductName
): {
  tags: string[]
  reason: string
  progress: number
  modulesInfo?: {
    total: number
    completed: number
  }
} {
  const progress = userProduct.progress?.percentage ?? 0
  const tags = evaluateProgressTags(userProduct, productName)

  let reason = ''
  if (progress === 0) {
    reason = 'Curso não iniciado (0%)'
  } else if (progress === 100) {
    reason = 'Curso concluído (100%) - tag aplicada em COMPLETION'
  } else {
    reason = `Progresso atual: ${progress}%`
  }

  // Informação adicional sobre módulos (se disponível)
  const modulesInfo = userProduct.progress?.modulesList
    ? {
        total: userProduct.progress.totalModules ?? userProduct.progress.modulesList.length,
        completed:
          typeof userProduct.progress.modulesCompleted === 'number'
            ? userProduct.progress.modulesCompleted
            : Array.isArray(userProduct.progress.modulesCompleted)
            ? userProduct.progress.modulesCompleted.length
            : userProduct.progress.modulesList.filter(m => m.completed || m.isCompleted).length
      }
    : undefined

  if (modulesInfo) {
    reason += ` (${modulesInfo.completed}/${modulesInfo.total} módulos)`
  }

  return { tags, reason, progress, modulesInfo }
}
