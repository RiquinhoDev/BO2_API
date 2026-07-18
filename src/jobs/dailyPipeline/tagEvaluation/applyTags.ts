// ════════════════════════════════════════════════════════════
// 📁 src/jobs/dailyPipeline/tagEvaluation/applyTags.ts
// Aplicação e Sincronização de Tags com ActiveCampaign
// ✅ USA O SERVIÇO EXISTENTE (não reimplementa!)
// ════════════════════════════════════════════════════════════

import { User, UserProduct, Product } from '../../../models'
import logger from '../../../utils/logger'
import { evaluateStudentTags, getTagsToAdd, getTagsToRemove } from './evaluateStudentTags'
import {
  IUserForEvaluation,
  IUserProductForEvaluation,
  IProductForEvaluation,
  ITagEvaluationOptions
} from './types'

// ✅ USAR SERVIÇO EXISTENTE
import { activeCampaignService } from '../../../services/activeCampaign/activeCampaignService'

export const isTagApplyEnabled = () =>
  process.env.AC_TAG_APPLY_ENABLED === 'true'

// ═══════════════════════════════════════════════════════════
// APLICAÇÃO DE TAGS
// ═══════════════════════════════════════════════════════════

interface IApplyTagsResult {
  success: boolean
  stats: {
    usersProcessed: number
    tagsApplied: number
    tagsRemoved: number
    errors: number
    skipped: number
  }
  errors: Array<{
    email: string
    error: string
  }>
}

/**
 * Avalia e aplica tags para todos os utilizadores ativos
 *
 * FLUXO COMPLETO:
 * 1. Buscar users ativos da BD
 * 2. Para cada user: avaliar tags (evaluateStudentTags)
 * 3. Comparar com tags atuais (getTagsToAdd/Remove)
 * 4. Aplicar no ActiveCampaign (activeCampaignService)
 * 5. Atualizar BD (UserProduct.activeCampaignData.tags)
 */
export async function evaluateAndApplyTags(
  options: ITagEvaluationOptions = {}
): Promise<IApplyTagsResult> {
  const { dryRun = false, verbose = false } = options
  const tagApplyEnabled = isTagApplyEnabled()

  logger.info('[TagApply] 🚀 Iniciando avaliação e aplicação de tags', { dryRun, verbose })

  if (!dryRun && !tagApplyEnabled) {
    logger.warn(
      '[TagApply] AC_TAG_APPLY_ENABLED != true; adição de tags desativada'
    )
  }

  const stats = {
    usersProcessed: 0,
    tagsApplied: 0,
    tagsRemoved: 0,
    errors: 0,
    skipped: 0
  }

  const errors: Array<{ email: string; error: string }> = []

  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 1: BUSCAR UTILIZADORES ATIVOS
    // ═══════════════════════════════════════════════════════════

    const users = await User.find({
      'metadata.isActive': true
    }).lean() as IUserForEvaluation[]

    logger.info('[TagApply] 📊 Utilizadores ativos encontrados', { total: users.length })

    // ═══════════════════════════════════════════════════════════
    // STEP 2: PRE-LOAD PRODUCTS (CACHE)
    // ═══════════════════════════════════════════════════════════

    const products = await Product.find({}).lean() as IProductForEvaluation[]
    const productsMap = new Map(products.map(p => [p._id.toString(), p]))

    logger.info('[TagApply] 📦 Produtos carregados', { total: productsMap.size })

    // ═══════════════════════════════════════════════════════════
    // STEP 3: PROCESSAR CADA UTILIZADOR
    // ═══════════════════════════════════════════════════════════

    for (const user of users) {
      try {
        if (!user.email) {
          stats.skipped++
          continue
        }

        // Buscar UserProducts do utilizador
        const userProducts = await UserProduct.find({
          userId: user._id,
          status: 'ACTIVE'
        }).lean() as IUserProductForEvaluation[]

        if (userProducts.length === 0) {
          stats.skipped++
          continue
        }

        // ─────────────────────────────────────────────────────────
        // AVALIAR TAGS (Tag System V2)
        // ─────────────────────────────────────────────────────────

        const result = await evaluateStudentTags(user, userProducts, productsMap, {
          verbose,
          includeDebugInfo: false
        })

        if (verbose) {
          logger.info(`[TagApply] 📧 ${user.email}`, {
            tagsEvaluated: result.tags.length,
            tags: result.tags.slice(0, 5) // Mostrar só primeiras 5
          })
        }

        // ─────────────────────────────────────────────────────────
        // COMPARAR COM TAGS ATUAIS
        // ─────────────────────────────────────────────────────────

        // Obter tags atuais do primeiro UserProduct
        const currentTagsInBD = userProducts[0]?.activeCampaignData?.tags || []

        // Identificar tags a adicionar/remover
        const toAdd = getTagsToAdd(currentTagsInBD, result.tags)
        const toRemove = getTagsToRemove(currentTagsInBD, result.tags)

        if (toAdd.length === 0 && toRemove.length === 0) {
          // Sem mudanças, skip
          stats.skipped++
          continue
        }

        if (verbose) {
          logger.info(`[TagApply] 🔄 ${user.email}`, {
            currentTags: currentTagsInBD.length,
            newTags: result.tags.length,
            toAdd: toAdd.length,
            toRemove: toRemove.length
          })
        }

        // ─────────────────────────────────────────────────────────
        // APLICAR NO ACTIVECAMPAIGN (se não for dry-run)
        // ─────────────────────────────────────────────────────────

        if (!dryRun) {
          // ✅ USAR SERVIÇO EXISTENTE para remover tags
          if (toRemove.length > 0) {
            try {
              await activeCampaignService.removeTagBatch(user.email, toRemove)
              stats.tagsRemoved += toRemove.length

              if (verbose) {
                logger.info(`[TagApply]   ➖ Removidas ${toRemove.length} tags`)
              }
            } catch (error: any) {
              logger.error('[TagApply] ❌ Erro ao remover tags', {
                email: user.email,
                error: error.message
              })
              stats.errors++
            }
          }

          // ✅ USAR SERVIÇO EXISTENTE para adicionar tags
          if (tagApplyEnabled && toAdd.length > 0) {
            try {
              await activeCampaignService.addTagsBatch(user.email, toAdd)
              stats.tagsApplied += toAdd.length

              if (verbose) {
                logger.info(`[TagApply]   ➕ Adicionadas ${toAdd.length} tags`)
              }
            } catch (error: any) {
              logger.error('[TagApply] ❌ Erro ao adicionar tags', {
                email: user.email,
                error: error.message
              })
              stats.errors++
            }
          }

          // ─────────────────────────────────────────────────────────
          // ATUALIZAR BD (sincronizar tags)
          // ─────────────────────────────────────────────────────────

          await UserProduct.updateMany(
            { userId: user._id },
            {
              $set: {
                'activeCampaignData.tags': result.tags,
                'activeCampaignData.lastSyncAt': new Date()
              }
            }
          )
        } else {
          // Dry-run: apenas contar
          stats.tagsApplied += toAdd.length
          stats.tagsRemoved += toRemove.length
        }

        stats.usersProcessed++

        // Rate limiting (pequena pausa entre users)
        if (!dryRun && stats.usersProcessed % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      } catch (error: any) {
        logger.error('[TagApply] ❌ Erro ao processar utilizador', {
          email: user.email,
          error: error.message
        })
        errors.push({
          email: user.email,
          error: error.message
        })
        stats.errors++
      }
    }

    // ═══════════════════════════════════════════════════════════
    // RESULTADO FINAL
    // ═══════════════════════════════════════════════════════════

    logger.info('[TagApply] ✅ Aplicação de tags concluída', {
      usersProcessed: stats.usersProcessed,
      tagsApplied: stats.tagsApplied,
      tagsRemoved: stats.tagsRemoved,
      errors: stats.errors,
      skipped: stats.skipped,
      dryRun
    })

    return {
      success: true,
      stats,
      errors
    }
  } catch (error: any) {
    logger.error('[TagApply] ❌ Erro fatal', { error: error.message })
    return {
      success: false,
      stats,
      errors: [{ email: 'SYSTEM', error: error.message }]
    }
  }
}
