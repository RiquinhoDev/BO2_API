// ════════════════════════════════════════════════════════════
// 📁 src/services/activeCampaign/testimonialTagSync.service.ts
// Serviço de sincronização de tags de testemunhos para Active Campaign
// ════════════════════════════════════════════════════════════

import User from '../../models/user'
import activeCampaignService from './activeCampaignService'
import logger from '../../utils/logger'

/**
 * Interface para resultado da sincronização
 */
export interface TestimonialTagSyncResult {
  success: boolean
  stats: {
    totalUsers: number
    totalTags: number
    synced: number
    skipped: number
    failed: number
  }
  errors: Array<{
    userId: string
    email: string
    error: string
  }>
}

/**
 * Sincroniza tags de testemunhos do User.communicationByCourse["TESTIMONIALS"]
 * para Active Campaign
 *
 * Fluxo:
 * 1. Buscar users com tags em communicationByCourse.TESTIMONIALS.currentTags
 * 2. Para cada user, buscar ou criar contacto no AC
 * 3. Se tag é de conclusão (_CONCLUIDO), remover tag antiga do AC
 * 4. Aplicar cada tag via AC API
 * 5. Marcar tags como sincronizadas (lastSyncedAt)
 *
 * @returns TestimonialTagSyncResult com estatísticas e erros
 */
export async function syncTestimonialTags(): Promise<TestimonialTagSyncResult> {
  const startTime = Date.now()

  const result: TestimonialTagSyncResult = {
    success: true,
    stats: {
      totalUsers: 0,
      totalTags: 0,
      synced: 0,
      skipped: 0,
      failed: 0
    },
    errors: []
  }

  try {
    logger.info('🏷️  [Testimonial Tags] Iniciando sincronização...')

    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR USERS COM TAGS DE TESTEMUNHOS
    // ═══════════════════════════════════════════════════════════

    // Buscar users que têm tags em communicationByCourse.TESTIMONIALS.currentTags
    const users = await User.find({
      'communicationByCourse.TESTIMONIALS.currentTags': { $exists: true, $ne: [] }
    }).select('email name communicationByCourse').lean()

    result.stats.totalUsers = users.length

    if (users.length === 0) {
      logger.info('   ℹ️  Nenhum user com tags de testemunhos encontrado')
      return result
    }

    logger.info(`   📊 ${users.length} user(s) com tags de testemunhos`)

    // ═══════════════════════════════════════════════════════════
    // 2. PROCESSAR CADA USER
    // ═══════════════════════════════════════════════════════════

    for (const user of users) {
      try {
        const email = user.email
        if (!email) {
          logger.warn(`   ⚠️  User ${user._id} sem email, ignorado`)
          result.stats.skipped++
          continue
        }

        // Obter tags do TESTIMONIALS
        const testimonialData = (user.communicationByCourse as any)?.get?.('TESTIMONIALS') ||
                               (user.communicationByCourse as any)?.TESTIMONIALS

        if (!testimonialData || !testimonialData.currentTags || testimonialData.currentTags.length === 0) {
          result.stats.skipped++
          continue
        }

        const tags = testimonialData.currentTags as string[]
        result.stats.totalTags += tags.length

        logger.info(`   🔄 ${email}: ${tags.length} tag(s) - ${tags.join(', ')}`)

        // ═══════════════════════════════════════════════════════════
        // 3. REMOVER TAGS ANTIGAS SE FOR TAG DE CONCLUSÃO
        // ═══════════════════════════════════════════════════════════

        // Se user tem tag de conclusão (ex: OGI_TESTEMUNHO_CONCLUIDO),
        // remover a tag de pedido correspondente (ex: OGI_TESTEMUNHO)
        const tagsToRemove: string[] = []
        for (const tag of tags) {
          if (tag.endsWith('_CONCLUIDO')) {
            const baseName = tag.replace('_CONCLUIDO', '')
            tagsToRemove.push(baseName)
          }
        }

        if (tagsToRemove.length > 0) {
          for (const oldTag of tagsToRemove) {
            try {
              const removed = await activeCampaignService.removeTag(email, oldTag)
              if (removed) {
                logger.info(`   🗑️  Tag antiga "${oldTag}" removida de ${email}`)
              }
            } catch (removeError: any) {
              logger.warn(`   ⚠️  Erro ao remover tag antiga "${oldTag}" de ${email}: ${removeError.message}`)
              // Não falhar por causa de remoção de tag
            }
          }
        }

        // ═══════════════════════════════════════════════════════════
        // 4. APLICAR CADA TAG NO ACTIVE CAMPAIGN
        // ═══════════════════════════════════════════════════════════

        for (const tagName of tags) {
          try {
            // Verificar se tag já foi sincronizada recentemente (últimas 24h)
            const lastSyncedAt = testimonialData.lastSyncedAt
            if (lastSyncedAt) {
              const hoursSinceSync = (Date.now() - new Date(lastSyncedAt).getTime()) / (1000 * 60 * 60)
              if (hoursSinceSync < 24) {
                logger.info(`   ⏭️  Tag "${tagName}" já sincronizada há ${Math.floor(hoursSinceSync)}h, ignorando`)
                result.stats.skipped++
                continue
              }
            }

            // Aplicar tag via Active Campaign Service
            await activeCampaignService.addTag(email, tagName)

            logger.info(`   ✅ Tag "${tagName}" aplicada em ${email}`)
            result.stats.synced++

          } catch (tagError: any) {
            logger.error(`   ❌ Erro ao aplicar tag "${tagName}" em ${email}: ${tagError.message}`)
            result.errors.push({
              userId: user._id.toString(),
              email,
              error: `Tag "${tagName}": ${tagError.message}`
            })
            result.stats.failed++
          }
        }

        // ═══════════════════════════════════════════════════════════
        // 5. MARCAR COMO SINCRONIZADO
        // ═══════════════════════════════════════════════════════════

        try {
          await User.updateOne(
            { _id: user._id },
            {
              $set: {
                'communicationByCourse.TESTIMONIALS.lastSyncedAt': new Date()
              }
            }
          )
        } catch (updateError: any) {
          logger.warn(`   ⚠️  Erro ao atualizar lastSyncedAt para ${email}: ${updateError.message}`)
        }

      } catch (userError: any) {
        logger.error(`   ❌ Erro ao processar user ${user.email}: ${userError.message}`)
        result.errors.push({
          userId: user._id.toString(),
          email: user.email || 'N/A',
          error: userError.message
        })
        result.stats.failed++
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 5. RESULTADO FINAL
    // ═══════════════════════════════════════════════════════════

    const duration = Math.floor((Date.now() - startTime) / 1000)

    result.success = result.stats.failed === 0

    logger.info('   ━'.repeat(30))
    if (result.success) {
      logger.info('   ✅ Sincronização de tags de testemunhos COMPLETA')
    } else {
      logger.warn('   ⚠️  Sincronização COMPLETA COM ERROS')
    }
    logger.info(`   ⏱️  Duração: ${duration}s`)
    logger.info(`   📊 Stats:`)
    logger.info(`      - Total users: ${result.stats.totalUsers}`)
    logger.info(`      - Total tags: ${result.stats.totalTags}`)
    logger.info(`      - Sincronizadas: ${result.stats.synced}`)
    logger.info(`      - Ignoradas: ${result.stats.skipped}`)
    logger.info(`      - Falhadas: ${result.stats.failed}`)
    logger.info('   ━'.repeat(30))

    if (result.errors.length > 0) {
      logger.error(`   ❌ Erros (${result.errors.length}):`)
      result.errors.slice(0, 10).forEach((err, i) => {
        logger.error(`      ${i + 1}. ${err.email}: ${err.error}`)
      })
      if (result.errors.length > 10) {
        logger.error(`      ... e mais ${result.errors.length - 10} erro(s)`)
      }
    }

    return result

  } catch (error: any) {
    logger.error('   ❌ Erro fatal na sincronização de tags de testemunhos:', error.message)
    result.success = false
    result.errors.push({
      userId: 'SYSTEM',
      email: 'SYSTEM',
      error: `Fatal: ${error.message}`
    })
    return result
  }
}

export default {
  syncTestimonialTags
}
