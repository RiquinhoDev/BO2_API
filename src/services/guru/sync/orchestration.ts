import logger from '../../../utils/logger'
import User, { type IUser } from '../../../models/user'
import UserProduct from '../../../models/UserProduct'
import { assertProviderReadBatchSize } from '../../../security/providerReadBatchPolicy'
import { getStatusPriority, getEffectiveStatus, type GuruDateInfo } from '../guru.constants'
import { fetchAllSubscriptionsPaginated, fetchContactByEmail, fetchContactSubscriptions, guruApiErrorDetails, subscriptionEmail, type GuruSubscription, type GuruSyncData, type SyncResult } from './client'
import { mapGuruStatus } from './persistence'

export async function syncAllSubscriptions(): Promise<SyncResult> {
  logger.info('\n════════════════════════════════════════════════════════')
  logger.info('💰 [GURU SYNC] INICIANDO SINCRONIZAÇÃO COMPLETA')
  logger.info('════════════════════════════════════════════════════════\n')

  const startTime = Date.now()

  const result: SyncResult = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    markedForInactivation: 0,
    uniqueEmails: 0,
    multiSubEmails: 0,
    details: []
  }

  try {
    // 1. Buscar todas as subscrições da Guru
    const subscriptions = await fetchAllSubscriptionsPaginated()
    assertProviderReadBatchSize(subscriptions.length, 'guru')
    result.total = subscriptions.length

    logger.info(`\n📊 [GURU SYNC] Total subscrições: ${subscriptions.length}`)

    // ═══════════════════════════════════════════════════════════
    // 2. PRÉ-AGRUPAR POR EMAIL
    // Garante que o melhor status de TODAS as subs é usado
    // Elimina problemas de ordem de processamento
    // ═══════════════════════════════════════════════════════════

    const subsByEmail = new Map<string, GuruSubscription[]>()

    for (const sub of subscriptions) {
      const email = subscriptionEmail(sub)

      if (!email) {
        result.skipped++
        continue
      }

      const emailSubscriptions = subsByEmail.get(email)
      if (emailSubscriptions) {
        emailSubscriptions.push(sub)
      } else {
        subsByEmail.set(email, [sub])
      }
    }

    result.uniqueEmails = subsByEmail.size
    result.multiSubEmails = Array.from(subsByEmail.values()).filter(subs => subs.length > 1).length

    logger.info(`📧 [GURU SYNC] ${subsByEmail.size} emails únicos (${result.multiSubEmails} com múltiplas subs)`)
    logger.info(`📊 [GURU SYNC] Processando email a email...\n`)

    // ═══════════════════════════════════════════════════════════
    // 3. PROCESSAR CADA EMAIL COM A MELHOR SUBSCRIÇÃO
    // ═══════════════════════════════════════════════════════════

    let processedCount = 0

    for (const [email, subs] of subsByEmail) {
      processedCount++

      try {
        // Encontrar a MELHOR subscrição para este email
        // NOTA: pending stale (>7 dias sem pagar) recebe prioridade 8 (pior que refunded)
        const bestSub = subs.reduce((best, curr) => {
          const bestStatus = mapGuruStatus(best.last_status || best.status || '')
          const currStatus = mapGuruStatus(curr.last_status || curr.status || '')
          const bestDates: GuruDateInfo = {
            updatedAt: best.dates?.last_status_at,
            nextCycleAt: best.dates?.next_cycle_at,
            startedAt: best.dates?.started_at
          }
          const currDates: GuruDateInfo = {
            updatedAt: curr.dates?.last_status_at,
            nextCycleAt: curr.dates?.next_cycle_at,
            startedAt: curr.dates?.started_at
          }
          const bestPrio = getStatusPriority(bestStatus, bestDates)
          const currPrio = getStatusPriority(currStatus, currDates)
          return currPrio < bestPrio ? curr : best
        })

        const bestStatus = mapGuruStatus(bestSub.last_status || bestSub.status || '')

        // Datas da melhor subscrição (para classificação de pending stale)
        const bestDatesForCheck: GuruDateInfo = {
          updatedAt: bestSub.dates?.last_status_at,
          nextCycleAt: bestSub.dates?.next_cycle_at,
          startedAt: bestSub.dates?.started_at
        }

        // Guardar dados da melhor subscrição
        const guruData: GuruSyncData = {
          guruContactId: bestSub.subscriber?.id || bestSub.contact?.id,
          subscriptionCode: bestSub.subscription_code || bestSub.code || bestSub.id,
          status: bestStatus,
          updatedAt: bestSub.dates?.last_status_at ? new Date(bestSub.dates.last_status_at)
            : bestSub.dates?.started_at ? new Date(bestSub.dates.started_at)
            : bestSub.dates?.created_at ? new Date(bestSub.dates.created_at)
            : undefined,
          nextCycleAt: bestSub.dates?.next_cycle_at ? new Date(bestSub.dates.next_cycle_at) : undefined,
          offerId: bestSub.product?.offer?.id || bestSub.offer?.id,
          productId: bestSub.product?.id || bestSub.product_id,
          paymentUrl: bestSub.current_invoice?.payment_url,
          lastSyncAt: new Date(),
          syncVersion: '3.0',
          lastWebhookAt: undefined
        }

        const subscriberName = bestSub.subscriber?.name || bestSub.contact?.name || bestSub.name || email.split('@')[0]

        // Buscar user existente
        const existingUser = await User.findOne({ email }).select('_id guru')
        let userId: IUser['_id']
        let action: 'created' | 'updated' | 'skipped'

        if (existingUser) {
          // Atualizar user com dados da melhor subscrição
          await User.updateOne(
            { _id: existingUser._id },
            {
              $set: {
                guru: guruData,
                'metadata.updatedAt': new Date(),
                'metadata.sources.guru': { lastSync: new Date(), version: '3.0' }
              }
            },
            { runValidators: false }
          )
          userId = existingUser._id
          action = 'updated'

          // Se melhorou de canceled → active, reverter PARA_INATIVAR
          // NOTA: pending stale é tratado como canceled
          const newEffectiveSync = getEffectiveStatus(bestStatus, bestDatesForCheck)
          if (!newEffectiveSync.isCanceled) {
            const revertResult = await UserProduct.updateMany(
              {
                userId,
                platform: 'curseduca',
                status: 'PARA_INATIVAR',
                'metadata.guruSyncMarked': true
              },
              {
                $set: {
                  status: 'ACTIVE',
                  'metadata.revertedAt': new Date(),
                  'metadata.revertedBy': 'guru_sync_v3',
                  'metadata.revertReason': `Subscrição ${bestStatus} encontrada (${guruData.subscriptionCode})`
                },
                $unset: {
                  'metadata.markedForInactivationAt': 1,
                  'metadata.markedForInactivationReason': 1,
                  'metadata.guruSyncMarked': 1
                }
              }
            )
            if (revertResult.modifiedCount > 0) {
              logger.info(`  🟢 REVERTIDO: ${email} - ${revertResult.modifiedCount} UserProduct(s) → ACTIVE (sub ${bestStatus})`)
            }
          }
        } else {
          // Criar novo user
          const newUser = await User.create({
            email,
            name: subscriberName,
            guru: guruData,
            metadata: {
              createdAt: new Date(),
              updatedAt: new Date(),
              sources: {
                guru: { lastSync: new Date(), version: '3.0' }
              }
            }
          })
          userId = newUser._id
          action = 'created'
        }

        // ═══════════════════════════════════════════════════════════
        // MARCAR PARA_INATIVAR SÓ SE TODAS AS SUBS SÃO CANCELADAS
        // Se o bestStatus é canceled (ou pending stale) → NENHUMA sub é ativa
        // ═══════════════════════════════════════════════════════════
        let markedForInactivation = 0
        const bestEffective = getEffectiveStatus(bestStatus, bestDatesForCheck)

        if (bestEffective.isCanceled) {
          const markResult = await UserProduct.updateMany(
            {
              userId,
              platform: 'curseduca',
              status: 'ACTIVE'
            },
            {
              $set: {
                status: 'PARA_INATIVAR',
                'metadata.markedForInactivationAt': new Date(),
                'metadata.markedForInactivationReason': `Guru sync v3: todas as ${subs.length} sub(s) canceladas (melhor: ${bestStatus})`,
                'metadata.guruSyncMarked': true
              }
            }
          )
          markedForInactivation = markResult.modifiedCount || 0
        }

        if (action === 'created') {
          result.created++
          logger.info(`  ✨ CRIADO: ${email} (${bestStatus}, ${subs.length} sub(s))`)
        } else {
          result.updated++
        }

        if (markedForInactivation > 0) {
          result.markedForInactivation += markedForInactivation
          logger.info(`  🔴 PARA_INATIVAR: ${email} (${markedForInactivation} UserProduct(s), ${subs.length} sub(s) todas ${bestStatus})`)
        }

        result.details.push({ email, action, markedForInactivation })

        // Log de progresso a cada 50 emails
        if (processedCount % 50 === 0) {
          logger.info(`\n📈 [GURU SYNC] Progresso: ${processedCount}/${subsByEmail.size} emails (✨${result.created} novos, 🔄${result.updated} atualizados, 🔴${result.markedForInactivation} p/inativar)\n`)
        }

      } catch (error: unknown) {
        const message = guruApiErrorDetails(error).message
        result.errors++
        result.details.push({ email, action: 'error', error: message })
        logger.error(`❌ [GURU SYNC] Erro ${email}:`, message)
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 4. POST-SYNC: CROSS-REFERENCE COM CURSEDUCA
    // ═══════════════════════════════════════════════════════════
    try {
      const { runCrossReferenceAfterGuruSync } = await import('../crossReference.service')
      const crossRefResult = await runCrossReferenceAfterGuruSync()
      result.crossReference = crossRefResult
    } catch (crossRefError: unknown) {
      logger.error('⚠️ [GURU SYNC] Cross-reference falhou (não-fatal):', guruApiErrorDetails(crossRefError).message)
    }

    const duration = Date.now() - startTime

    logger.info('\n════════════════════════════════════════════════════════')
    logger.info('✅ [GURU SYNC] SINCRONIZAÇÃO COMPLETA!')
    logger.info('════════════════════════════════════════════════════════')
    logger.info(`📊 Total subscrições: ${result.total}`)
    logger.info(`📧 Emails únicos: ${result.uniqueEmails} (${result.multiSubEmails} com múltiplas subs)`)
    logger.info(`✨ Novos criados: ${result.created}`)
    logger.info(`🔄 Atualizados: ${result.updated}`)
    logger.info(`⏭️ Ignorados (sem email): ${result.skipped}`)
    logger.info(`❌ Erros: ${result.errors}`)
    logger.info(`🔴 Marcados PARA_INATIVAR: ${result.markedForInactivation}`)
    if (result.crossReference) {
      logger.info(`🔄 Cross-reference: ${result.crossReference.confirmedInactive} confirmados INACTIVE, ${result.crossReference.revertedToActive} revertidos`)
    }
    logger.info(`\n⏱️ Duração: ${(duration / 1000).toFixed(2)}s`)
    logger.info('════════════════════════════════════════════════════════\n')

    return result

  } catch (error: unknown) {
    logger.error('\n❌ [GURU SYNC] ERRO FATAL:', guruApiErrorDetails(error).message)
    throw error
  }
}

/**
 * Verificar se um email existe na Guru (útil para SSO inteligente)
 */
export async function checkEmailInGuru(email: string): Promise<{
  exists: boolean
  subscription?: GuruSubscription
}> {
  try {
    // Tentar encontrar contacto
    const contact = await fetchContactByEmail(email)

    if (!contact) {
      return { exists: false }
    }

    // Buscar subscrições do contacto
    const subscriptions = await fetchContactSubscriptions(contact.id)

    if (subscriptions.length === 0) {
      return { exists: true, subscription: undefined }
    }

    // Retornar a subscrição mais recente/ativa
    const activeSubscription = subscriptions.find(s =>
      ['active', 'paid', 'trialing', 'past_due', 'pastdue'].includes(s.last_status?.toLowerCase())
    ) || subscriptions[0]

    return { exists: true, subscription: activeSubscription }

  } catch (error: unknown) {
    logger.error(`❌ [GURU SYNC] Erro ao verificar email ${email}:`, guruApiErrorDetails(error).message)
    return { exists: false }
  }
}
