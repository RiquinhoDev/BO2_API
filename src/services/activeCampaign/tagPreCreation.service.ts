// ════════════════════════════════════════════════════════════
// 📁 src/services/activeCampaign/tagPreCreation.service.ts
// PRÉ-CRIAÇÃO DE TAGS BO (STEP 3 do Pipeline)
// ════════════════════════════════════════════════════════════
//
// OBJETIVO:
// Garantir que TODAS as tags BO existem na AC ANTES de aplicar
// aos alunos. Isto evita criar tags durante o processamento
// (mais rápido) e permite usar cache de IDs.
//
// ════════════════════════════════════════════════════════════

import logger from '../../utils/logger'
import TagRule from '../../models/acTags/TagRule'
import activeCampaignService from './activeCampaignService'

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface TagPreCreationResult {
  success: boolean
  totalTags: number
  created: number
  existing: number
  failed: string[]
  tagCache: Map<string, string> // tagName → tagId
  duration: number
}

// ═══════════════════════════════════════════════════════════
// CACHE GLOBAL (usado por todo o pipeline)
// ═══════════════════════════════════════════════════════════

let GLOBAL_TAG_CACHE: Map<string, string> | null = null

export function getTagCache(): Map<string, string> | null {
  return GLOBAL_TAG_CACHE
}

export function clearTagCache(): void {
  GLOBAL_TAG_CACHE = null
}

// ═══════════════════════════════════════════════════════════
// MAIN SERVICE
// ═══════════════════════════════════════════════════════════

/**
 * Pré-cria TODAS as tags BO na Active Campaign
 *
 * Fluxo:
 * 1. Busca TODAS as TagRules ativas
 * 2. Extrai lista única de tag names
 * 3. Para cada tag:
 *    - Verifica se existe na AC
 *    - Se não existir → cria
 *    - Se existir → skip
 * 4. Retorna Map com tagName → tagId (cache)
 */
export async function preCreateBOTags(): Promise<TagPreCreationResult> {
  const startTime = Date.now()

  const result: TagPreCreationResult = {
    success: true,
    totalTags: 0,
    created: 0,
    existing: 0,
    failed: [],
    tagCache: new Map(),
    duration: 0
  }

  try {
    console.log('[PRE-CREATE] ▶️ Buscando TagRules ativas na BD...')

    // Buscar TagRules ativas
    const tagRules = await TagRule.find({ isActive: true })
      .select('actions.addTag')
      .lean()

    console.log(`[PRE-CREATE] ✅ Encontradas ${tagRules.length} TagRules ativas`)

    // Extrair tag names únicos
    const tagNames = new Set<string>()

    for (const rule of tagRules) {
      const tagName = (rule as any).actions?.addTag
      if (tagName && typeof tagName === 'string') {
        tagNames.add(tagName)
      }
    }

    const uniqueTags = Array.from(tagNames).sort()
    result.totalTags = uniqueTags.length

    console.log(`[PRE-CREATE] 📋 ${uniqueTags.length} tags únicas encontradas`)

    if (uniqueTags.length === 0) {
      console.log('[PRE-CREATE] ⚠️ Nenhuma tag encontrada, a retornar...')
      result.duration = Math.floor((Date.now() - startTime) / 1000)
      return result
    }

    console.log('[PRE-CREATE] ▶️ A iniciar loop de pré-criação...')

    // Pré-criar tags na AC
    for (let i = 0; i < uniqueTags.length; i++) {
      const tagName = uniqueTags[i]

      // Log de progresso a cada 5 tags ou no final
      if (i % 5 === 0 || i === uniqueTags.length - 1) {
        console.log(`[PRE-CREATE] 🏷️ Tag ${i + 1}/${uniqueTags.length}: "${tagName}"`)
      }

      try {
        const tagId = await activeCampaignService.getOrCreateTag(tagName)
        result.tagCache.set(tagName, tagId)
        result.existing++

      } catch (error: any) {
        logger.error(`   ❌ Tag "${tagName}": ${error.message}`)
        result.failed.push(tagName)
        result.success = false
      }

      // Pequena pausa para não sobrecarregar rate limit
      if (i < uniqueTags.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    // Guardar cache global
    GLOBAL_TAG_CACHE = result.tagCache
    result.duration = Math.floor((Date.now() - startTime) / 1000)

    return result

  } catch (error: any) {
    result.success = false
    result.duration = Math.floor((Date.now() - startTime) / 1000)

    logger.error(`❌ Erro fatal na pré-criação: ${error.message}`)

    return result
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  preCreateBOTags,
  getTagCache,
  clearTagCache
}
