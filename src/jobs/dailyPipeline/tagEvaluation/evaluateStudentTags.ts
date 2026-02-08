// ════════════════════════════════════════════════════════════
// 📁 src/jobs/dailyPipeline/tagEvaluation/evaluateStudentTags.ts
// Função Principal de Avaliação de Tags
// ════════════════════════════════════════════════════════════

import {
  IUserProductForEvaluation,
  IUserForEvaluation,
  IProductForEvaluation,
  ITagEvaluationResult,
  ITagEvaluationOptions,
  ProductName,
  TagCategory
} from './types'

import { evaluateAccountStatusTags } from './accountStatusTags'
import { evaluateInactivityTags } from './inactivityTags'
import { evaluateEngagementTags } from './engagementTags'
import { evaluateProgressTags } from './progressTags'
import { evaluateCompletionTags } from './completionTags'
import { evaluatePositiveTags } from './positiveTags'
import { evaluateModuleStuckTags } from './moduleStuckTags'
import { calculateEngagementScore } from './engagementScore'

/**
 * Normaliza o nome do produto para o formato padrão
 */
function normalizeProductName(product: IProductForEvaluation): ProductName {
  const name = product.name || product.code || 'UNKNOWN'

  // OGI
  if (/OGI/i.test(name)) {
    return 'OGI_V1'
  }

  // CLAREZA Anual
  if (/CLAREZA.*ANUAL/i.test(name) || /CLAREZA.*12/i.test(name)) {
    return 'CLAREZA_ANUAL'
  }

  // CLAREZA Mensal
  if (/CLAREZA.*MENSAL/i.test(name) || /CLAREZA.*MONTH/i.test(name)) {
    return 'CLAREZA_MENSAL'
  }

  // CLAREZA genérico (fallback para Anual)
  if (/CLAREZA/i.test(name)) {
    return 'CLAREZA_ANUAL'
  }

  // Retorna nome original se não identificar
  return name
}

/**
 * Filtra tags de testemunhos (mantém sempre)
 */
function isTestimonialTag(tag: string): boolean {
  return /testemunho/i.test(tag) || /depoimento/i.test(tag) || /review/i.test(tag)
}

/**
 * Filtra tags do sistema (podem ser substituídas)
 * 🛡️ ATUALIZADO: Agora verifica prefixo BO_
 */
function isSystemTag(tag: string): boolean {
  // Tags que começam com BO_ são tags do sistema
  return tag.startsWith('BO_')
}

/**
 * Avalia todas as tags de um aluno para todos os seus produtos
 *
 * ORDEM DE APLICAÇÃO (por prioridade):
 * 1. ACCOUNT_STATUS (prioridade máxima)
 * 2. COMPLETION (segunda prioridade)
 * 3. INACTIVITY (terceira prioridade)
 * 4. PROGRESS (quarta prioridade)
 * 5. ENGAGEMENT (quinta prioridade)
 * 6. POSITIVE (sexta prioridade - Ativo, Super Utilizador)
 * 7. MODULE_STUCK (sétima prioridade - Parou após M1, OGI apenas)
 *
 * @param user - Dados do utilizador
 * @param userProducts - Array de UserProducts do utilizador
 * @param products - Map de produtos (productId → product)
 * @param options - Opções de avaliação (dryRun, verbose, etc.)
 * @returns Resultado da avaliação com todas as tags
 */
export async function evaluateStudentTags(
  user: IUserForEvaluation,
  userProducts: IUserProductForEvaluation[],
  products: Map<string, IProductForEvaluation>,
  options: ITagEvaluationOptions = {}
): Promise<ITagEvaluationResult> {
  const { verbose = false, includeDebugInfo = false } = options

  const allTags: string[] = []
  const appliedTagsDetails: {
    category: TagCategory
    tags: string[]
    reason: string
  }[] = []

  // ─────────────────────────────────────────────────────────────
  // MANTER TAGS EXISTENTES DE TESTEMUNHOS
  // ─────────────────────────────────────────────────────────────
  const existingTestimonialTags: string[] = []
  for (const up of userProducts) {
    const existingTags = up.activeCampaignData?.tags || []
    existingTags.forEach(tag => {
      if (isTestimonialTag(tag) && !existingTestimonialTags.includes(tag)) {
        existingTestimonialTags.push(tag)
      }
    })
  }

  if (verbose && existingTestimonialTags.length > 0) {
    console.log(`  📝 Mantendo tags de testemunhos: ${existingTestimonialTags.join(', ')}`)
  }

  // ─────────────────────────────────────────────────────────────
  // AVALIAR CADA PRODUTO DO ALUNO
  // ─────────────────────────────────────────────────────────────
  for (const userProduct of userProducts) {
    const product = products.get(userProduct.productId.toString())
    if (!product) {
      if (verbose) {
        console.log(`  ⚠️  Produto não encontrado: ${userProduct.productId}`)
      }
      continue
    }

    const productName = normalizeProductName(product)

    if (verbose) {
      console.log(`\n  📦 Avaliando produto: ${productName} (${product._id})`)
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1️⃣ ACCOUNT_STATUS (prioridade máxima)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const accountStatusTags = evaluateAccountStatusTags(userProduct, user, productName)
    if (accountStatusTags.length > 0) {
      allTags.push(...accountStatusTags)
      appliedTagsDetails.push({
        category: 'ACCOUNT_STATUS',
        tags: accountStatusTags,
        reason: `Status: ${userProduct.status}`
      })

      if (verbose) {
        console.log(`    ✅ ACCOUNT_STATUS: ${accountStatusTags.join(', ')}`)
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2️⃣ COMPLETION (segunda prioridade)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const completionTags = evaluateCompletionTags(userProduct, productName)
    if (completionTags.length > 0) {
      allTags.push(...completionTags)
      appliedTagsDetails.push({
        category: 'COMPLETION',
        tags: completionTags,
        reason: `Progresso: ${userProduct.progress?.percentage || 0}%`
      })

      if (verbose) {
        console.log(`    ✅ COMPLETION: ${completionTags.join(', ')}`)
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3️⃣ INACTIVITY (terceira prioridade)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const inactivityTags = evaluateInactivityTags(userProduct, productName)
    if (inactivityTags.length > 0) {
      allTags.push(...inactivityTags)
      appliedTagsDetails.push({
        category: 'INACTIVITY',
        tags: inactivityTags,
        reason: `Dias inativo: ${userProduct.engagement?.daysInactive || 0}`
      })

      if (verbose) {
        console.log(`    ✅ INACTIVITY: ${inactivityTags.join(', ')}`)
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 4️⃣ PROGRESS (quarta prioridade)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const progressTags = evaluateProgressTags(userProduct, productName)
    if (progressTags.length > 0) {
      allTags.push(...progressTags)
      appliedTagsDetails.push({
        category: 'PROGRESS',
        tags: progressTags,
        reason: `Progresso: ${userProduct.progress?.percentage || 0}%`
      })

      if (verbose) {
        console.log(`    ✅ PROGRESS: ${progressTags.join(', ')}`)
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 5️⃣ ENGAGEMENT (quinta prioridade)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const engagementTags = evaluateEngagementTags(userProduct, productName)
    if (engagementTags.length > 0) {
      const score = calculateEngagementScore(userProduct, productName)
      allTags.push(...engagementTags)
      appliedTagsDetails.push({
        category: 'ENGAGEMENT',
        tags: engagementTags,
        reason: `Engagement score: ${score}/100`
      })

      if (verbose) {
        console.log(`    ✅ ENGAGEMENT: ${engagementTags.join(', ')} (score: ${score})`)
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 6️⃣ POSITIVE (sexta prioridade - Ativo, Super Utilizador)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const positiveTags = evaluatePositiveTags(userProduct, productName)
    if (positiveTags.length > 0) {
      allTags.push(...positiveTags)
      appliedTagsDetails.push({
        category: 'POSITIVE' as TagCategory,
        tags: positiveTags,
        reason: `Tags positivas: ${positiveTags.join(', ')}`
      })

      if (verbose) {
        console.log(`    ✅ POSITIVE: ${positiveTags.join(', ')}`)
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 7️⃣ MODULE_STUCK (sétima prioridade - Parou após M1, OGI apenas)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const moduleStuckTags = evaluateModuleStuckTags(userProduct, productName)
    if (moduleStuckTags.length > 0) {
      allTags.push(...moduleStuckTags)
      appliedTagsDetails.push({
        category: 'MODULE_STUCK' as TagCategory,
        tags: moduleStuckTags,
        reason: `Parou após módulo: ${moduleStuckTags.join(', ')}`
      })

      if (verbose) {
        console.log(`    ✅ MODULE_STUCK: ${moduleStuckTags.join(', ')}`)
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ADICIONAR TAGS DE TESTEMUNHOS DE VOLTA
  // ─────────────────────────────────────────────────────────────
  allTags.push(...existingTestimonialTags)

  // ─────────────────────────────────────────────────────────────
  // REMOVER DUPLICADOS
  // ─────────────────────────────────────────────────────────────
  const uniqueTags = [...new Set(allTags)]

  // ─────────────────────────────────────────────────────────────
  // RESULTADO
  // ─────────────────────────────────────────────────────────────
  const result: ITagEvaluationResult = {
    userId: user._id,
    email: user.email,
    tags: uniqueTags,
    appliedTags: appliedTagsDetails
  }

  // Debug info (opcional)
  if (includeDebugInfo && userProducts.length > 0) {
    const firstProduct = userProducts[0]
    result.debug = {
      engagementScore: calculateEngagementScore(firstProduct, 'DEBUG'),
      daysInactive: firstProduct.engagement?.daysInactive,
      progress: firstProduct.progress?.percentage,
      productName: products.get(firstProduct.productId.toString())?.name
    }
  }

  return result
}

/**
 * Obtém lista de tags a remover (tags do sistema que não estão mais aplicadas)
 */
export function getTagsToRemove(
  currentTags: string[],
  newTags: string[]
): string[] {
  const tagsToRemove: string[] = []

  for (const tag of currentTags) {
    // Manter tags de testemunhos
    if (isTestimonialTag(tag)) {
      continue
    }

    // Se é tag do sistema e não está nas novas tags, remover
    if (isSystemTag(tag) && !newTags.includes(tag)) {
      tagsToRemove.push(tag)
    }
  }

  return tagsToRemove
}

/**
 * Obtém lista de tags a adicionar (tags novas que ainda não existem)
 */
export function getTagsToAdd(
  currentTags: string[],
  newTags: string[]
): string[] {
  const tagsToAdd: string[] = []

  for (const tag of newTags) {
    if (!currentTags.includes(tag)) {
      tagsToAdd.push(tag)
    }
  }

  return tagsToAdd
}
