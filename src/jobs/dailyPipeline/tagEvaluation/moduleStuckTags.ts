// ════════════════════════════════════════════════════════════
// 📁 src/jobs/dailyPipeline/tagEvaluation/moduleStuckTags.ts
// Avaliação de Tags de Módulos (Parou após M1)
// ════════════════════════════════════════════════════════════

import { IUserProductForEvaluation, ProductName } from './types'
import { formatBOTag } from './tagFormatter'

/**
 * Avalia e retorna tags de "parou após módulo X"
 *
 * Regra: "Parou após M1"
 * - Completou módulo 1
 * - NÃO iniciou módulo 2 (0 páginas completadas)
 * - Inativo há 5+ dias
 * - Completou M1 há mais de 5 dias
 *
 * Nota: Apenas para OGI (Hotmart fornece dados de módulos)
 *
 * @param userProduct - UserProduct com dados de progress.modulesList
 * @param productName - Nome do produto (OGI_V1, CLAREZA_ANUAL, etc.)
 * @returns Array com 0 ou 1 tag de módulo
 */
export function evaluateModuleStuckTags(
  userProduct: IUserProductForEvaluation,
  productName: ProductName
): string[] {
  const tags: string[] = []

  // ─────────────────────────────────────────────────────────────
  // VERIFICAÇÃO 1: Apenas para OGI
  // ─────────────────────────────────────────────────────────────

  if (!productName.includes('OGI')) {
    return tags // CLAREZA não tem dados de módulos
  }

  // ─────────────────────────────────────────────────────────────
  // VERIFICAÇÃO 2: Dados de módulos disponíveis?
  // ─────────────────────────────────────────────────────────────

  const modulesList = userProduct.progress?.modulesList || []

  if (modulesList.length < 2) {
    return tags // Precisa de pelo menos M1 e M2
  }

  // ─────────────────────────────────────────────────────────────
  // VERIFICAÇÃO 3: Encontrar M1 e M2 (POR NOME E ORDEM)
  // ─────────────────────────────────────────────────────────────

  // ESTRATÉGIA 1: Ordenar por moduleId (mais robusto)
  // moduleIds típicos: "boas-vindas-e-comunidade", "os-primeiros-passos-para-investir", etc.
  const sortedModules = [...modulesList].sort((a, b) => {
    // Tentar converter moduleId para número se possível
    const aNum = parseInt(a.moduleId)
    const bNum = parseInt(b.moduleId)

    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum
    }

    // Se não for número, usar ordem alfabética ou sequence
    if (a.sequence !== undefined && b.sequence !== undefined) {
      return a.sequence - b.sequence
    }

    return a.moduleId.localeCompare(b.moduleId)
  })

  // ESTRATÉGIA 2: Identificar M1 por nome conhecido
  const knownM1Names = [
    'boas-vindas',
    'primeiros passos',
    'fire.*liberdade financeira'
  ]

  let m1 = sortedModules[0] // Primeiro por padrão
  let m2 = sortedModules[1] // Segundo por padrão

  // Verificar se o primeiro módulo tem nome de M1 conhecido
  const m1Candidate = modulesList.find(m => {
    const name = (m.name || '').toLowerCase()
    return knownM1Names.some(pattern => new RegExp(pattern, 'i').test(name))
  })

  if (m1Candidate) {
    m1 = m1Candidate

    // M2 é o próximo módulo após M1 na lista ordenada
    const m1Index = sortedModules.findIndex(m => m.moduleId === m1.moduleId)
    if (m1Index !== -1 && m1Index + 1 < sortedModules.length) {
      m2 = sortedModules[m1Index + 1]
    }
  }

  if (!m1 || !m2) {
    return tags // M1 ou M2 não encontrados
  }

  // ─────────────────────────────────────────────────────────────
  // VERIFICAÇÃO 4: M1 completo E M2 não iniciado?
  // ─────────────────────────────────────────────────────────────

  const m1Complete = m1.isCompleted === true
  const m2NotStarted = (m2.completedPages ?? 0) === 0

  if (!m1Complete || !m2NotStarted) {
    return tags // Não cumpre critérios
  }

  // ─────────────────────────────────────────────────────────────
  // VERIFICAÇÃO 5: Inativo há 5+ dias?
  // ─────────────────────────────────────────────────────────────

  const daysInactive = userProduct.engagement?.daysSinceLastLogin ?? 0

  if (daysInactive < 5) {
    return tags // Ainda está ativo
  }

  // ─────────────────────────────────────────────────────────────
  // VERIFICAÇÃO 6: Completou M1 há mais de 5 dias?
  // ─────────────────────────────────────────────────────────────

  if (m1.lastCompletedDate) {
    const now = Date.now()
    const daysSinceM1 = Math.floor(
      (now - m1.lastCompletedDate) / (1000 * 60 * 60 * 24)
    )

    if (daysSinceM1 < 5) {
      return tags // Completou M1 recentemente (< 5 dias)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // TODAS AS CONDIÇÕES CUMPRIDAS: Aplicar tag
  // ─────────────────────────────────────────────────────────────

  tags.push(formatBOTag(productName, 'Parou após M1'))

  return tags
}

/**
 * Retorna tags de módulo com informação de debug
 */
export function evaluateModuleStuckTagsWithDebug(
  userProduct: IUserProductForEvaluation,
  productName: ProductName
): {
  tags: string[]
  reason: string
  m1Status?: {
    isCompleted: boolean
    completedPages: number
    totalPages: number
    daysSinceCompletion?: number
  }
  m2Status?: {
    isCompleted: boolean
    completedPages: number
    totalPages: number
  }
} {
  const tags = evaluateModuleStuckTags(userProduct, productName)

  if (!productName.includes('OGI')) {
    return {
      tags,
      reason: 'Produto não é OGI (sem dados de módulos)'
    }
  }

  const modulesList = userProduct.progress?.modulesList || []

  // Usar mesma lógica que a função principal
  const sortedModules = [...modulesList].sort((a, b) => {
    const aNum = parseInt(a.moduleId)
    const bNum = parseInt(b.moduleId)

    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum
    }

    if (a.sequence !== undefined && b.sequence !== undefined) {
      return a.sequence - b.sequence
    }

    return a.moduleId.localeCompare(b.moduleId)
  })

  const knownM1Names = [
    'boas-vindas',
    'primeiros passos',
    'fire.*liberdade financeira'
  ]

  let m1 = sortedModules[0]
  let m2 = sortedModules[1]

  const m1Candidate = modulesList.find(m => {
    const name = (m.name || '').toLowerCase()
    return knownM1Names.some(pattern => new RegExp(pattern, 'i').test(name))
  })

  if (m1Candidate) {
    m1 = m1Candidate
    const m1Index = sortedModules.findIndex(m => m.moduleId === m1.moduleId)
    if (m1Index !== -1 && m1Index + 1 < sortedModules.length) {
      m2 = sortedModules[m1Index + 1]
    }
  }

  if (!m1 || !m2) {
    return {
      tags,
      reason: 'M1 ou M2 não encontrados nos dados'
    }
  }

  const m1Status = {
    isCompleted: m1.isCompleted === true,
    completedPages: m1.completedPages ?? 0,
    totalPages: m1.totalPages ?? 0,
    daysSinceCompletion: m1.lastCompletedDate
      ? Math.floor((Date.now() - m1.lastCompletedDate) / (1000 * 60 * 60 * 24))
      : undefined
  }

  const m2Status = {
    isCompleted: m2.isCompleted === true,
    completedPages: m2.completedPages ?? 0,
    totalPages: m2.totalPages ?? 0
  }

  const daysInactive = userProduct.engagement?.daysSinceLastLogin ?? 0

  let reason = ''
  if (tags.length > 0) {
    reason = `Parou após M1: M1 completo (${m1Status.daysSinceCompletion}d atrás), M2 não iniciado, inativo ${daysInactive}d`
  } else if (!m1Status.isCompleted) {
    reason = `M1 não completo (${m1Status.completedPages}/${m1Status.totalPages} páginas)`
  } else if (m2Status.completedPages > 0) {
    reason = `M2 já iniciado (${m2Status.completedPages}/${m2Status.totalPages} páginas)`
  } else if (daysInactive < 5) {
    reason = `Inativo apenas ${daysInactive}d (precisa 5+)`
  } else if (m1Status.daysSinceCompletion !== undefined && m1Status.daysSinceCompletion < 5) {
    reason = `M1 completado recentemente (${m1Status.daysSinceCompletion}d atrás, precisa 5+)`
  }

  return { tags, reason, m1Status, m2Status }
}
