import logger from '../../../utils/logger'
import User, { type IUser } from '../../../models/user'
import UserProduct from '../../../models/UserProduct'
import { GURU_CANCELED_STATUSES, getEffectiveStatus, isStatusBetterOrEqual as sharedIsStatusBetterOrEqual, type GuruDateInfo } from '../guru.constants'
import { type GuruStatus, type GuruSubscription, type GuruSyncData, subscriptionEmail } from './client'

export function mapGuruStatus(guruStatus: string): GuruStatus {
  const statusMap: Record<string, GuruStatus> = {
    'active': 'active',
    'paid': 'active',
    'trialing': 'trial',
    'trial': 'trial',
    'past_due': 'pastdue',
    'pastdue': 'pastdue',
    'unpaid': 'pastdue',
    'canceled': 'canceled',
    'cancelled': 'canceled',
    'expired': 'expired',
    'pending': 'pending',
    'refunded': 'refunded',
    'suspended': 'suspended'
  }
  return statusMap[guruStatus?.toLowerCase()] || 'pending'
}

/**
 * Guardar subscrição na nossa BD
 * NOTA: Também marca UserProducts como PARA_INATIVAR se status for cancelado
 */
export async function saveSubscriptionToDb(subscription: GuruSubscription): Promise<{
  action: 'created' | 'updated' | 'skipped'
  email: string
  markedForInactivation?: number
}> {
  // Tentar encontrar o email em diferentes locais da estrutura
  const email = subscriptionEmail(subscription)

  if (!email) {
    logger.warn('⚠️ [GURU SYNC] Subscrição sem email:', JSON.stringify({
      id: subscription.id,
      code: subscription.subscription_code,
      subscriber: subscription.subscriber,
      keys: Object.keys(subscription)
    }, null, 2))
    return { action: 'skipped', email: 'sem-email' }
  }

  const mappedStatus = mapGuruStatus(subscription.last_status || subscription.status || '')

  const guruData: GuruSyncData = {
    guruContactId: subscription.subscriber?.id || subscription.contact?.id,
    subscriptionCode: subscription.subscription_code || subscription.code || subscription.id,
    status: mappedStatus,
    updatedAt: subscription.dates?.last_status_at ? new Date(subscription.dates.last_status_at)
      : subscription.dates?.started_at ? new Date(subscription.dates.started_at)
      : subscription.dates?.created_at ? new Date(subscription.dates.created_at)
      : undefined,
    nextCycleAt: subscription.dates?.next_cycle_at ? new Date(subscription.dates.next_cycle_at) : undefined,
    offerId: subscription.product?.offer?.id || subscription.offer?.id,
    productId: subscription.product?.id || subscription.product_id,
    paymentUrl: subscription.current_invoice?.payment_url,
    // Trial
    isTrial: mappedStatus === 'trial',
    trialStartedAt: subscription.trial_started_at ? new Date(subscription.trial_started_at) : undefined,
    trialFinishedAt: subscription.trial_finished_at ? new Date(subscription.trial_finished_at) : undefined,
    // Se era trial e agora é active → converteu
    trialConvertedAt: undefined,
    lastSyncAt: new Date(),
    syncVersion: '2.0',
    lastWebhookAt: undefined // Não veio de webhook, veio de sync
  }

  // Nome do subscriber
  const subscriberName = subscription.subscriber?.name || subscription.contact?.name || subscription.name || email.split('@')[0]

  const existingUser = await User.findOne({ email }).select('_id guru')
  let action: 'created' | 'updated' | 'skipped'

  let userId: IUser['_id']

  if (existingUser) {
    const currentGuruStatus = existingUser.guru?.status || null

    // ═══════════════════════════════════════════════════════════
    // PRIORIDADE DE SUBSCRIÇÕES: Só atualizar se nova for MELHOR
    // Isto resolve o problema de múltiplas subscrições por email
    // Ex: sub_A (active) + sub_B (canceled) → guardar active!
    // NOTA: pending stale (>7 dias sem pagar) tem prioridade PIOR que canceled
    // ═══════════════════════════════════════════════════════════
    const newDates: GuruDateInfo = {
      updatedAt: guruData.updatedAt,
      nextCycleAt: guruData.nextCycleAt
    }
    const currentDates: GuruDateInfo = {
      updatedAt: existingUser.guru?.updatedAt,
      nextCycleAt: existingUser.guru?.nextCycleAt
    }
    if (currentGuruStatus && !sharedIsStatusBetterOrEqual(guruData.status, currentGuruStatus, newDates, currentDates)) {
      logger.info(`  ⏭️ SKIP: ${email} - manter ${currentGuruStatus} (ignorar ${guruData.status} de sub ${guruData.subscriptionCode})`)
      return { action: 'skipped', email, markedForInactivation: 0 }
    }

    // Nova subscrição é melhor ou igual - atualizar
    await User.updateOne(
      { _id: existingUser._id },
      {
        $set: {
          guru: guruData,
          'metadata.updatedAt': new Date(),
          'metadata.sources.guru': { lastSync: new Date(), version: '2.0' }
        }
      },
      { runValidators: false }
    )
    userId = existingUser._id
    action = 'updated'

    // Se estamos a MELHORAR o status (ex: canceled → active),
    // reverter PARA_INATIVAR que possa ter sido marcado por subscrição anterior
    const currentEffective = getEffectiveStatus(currentGuruStatus, currentDates)
    const newEffective = getEffectiveStatus(guruData.status, newDates)
    if (currentGuruStatus && currentEffective.isCanceled && !newEffective.isCanceled) {
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
            'metadata.revertedBy': 'guru_sync_priority',
            'metadata.revertReason': `Encontrada subscrição ${guruData.status} (${guruData.subscriptionCode})`
          },
          $unset: {
            'metadata.markedForInactivationAt': 1,
            'metadata.markedForInactivationReason': 1,
            'metadata.guruSyncMarked': 1
          }
        }
      )
      if (revertResult.modifiedCount > 0) {
        logger.info(`  ✅ REVERTIDO: ${email} - ${revertResult.modifiedCount} UserProduct(s) voltaram a ACTIVE (encontrada sub ${guruData.status})`)
      }
    }
  } else {
    // Criar user apenas com campos essenciais + Guru
    const newUser = await User.create({
      email,
      name: subscriberName,
      guru: guruData,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        sources: {
          guru: { lastSync: new Date(), version: '2.0' }
        }
      }
    })
    userId = newUser._id
    action = 'created'
  }

  // ═══════════════════════════════════════════════════════════
  // MARCAR USERPRODUCTS PARA INATIVAR SE STATUS FOR CANCELADO
  // (Só marca se o status guardado é realmente canceled -
  //  ou seja, não há nenhuma subscrição active para este email)
  // ═══════════════════════════════════════════════════════════
  let markedForInactivation = 0

  if (GURU_CANCELED_STATUSES.includes(guruData.status)) {
    // Buscar UserProducts do CursEduca que estejam ACTIVE
    const result = await UserProduct.updateMany(
      {
        userId,
        platform: 'curseduca',
        status: 'ACTIVE'
      },
      {
        $set: {
          status: 'PARA_INATIVAR',
          'metadata.markedForInactivationAt': new Date(),
          'metadata.markedForInactivationReason': `Sync Guru: status ${guruData.status}`,
          'metadata.guruSyncMarked': true
        }
      }
    )

    markedForInactivation = result.modifiedCount || 0

    if (markedForInactivation > 0) {
      logger.info(`  ⚠️ PARA_INATIVAR: ${email} (${markedForInactivation} UserProduct(s))`)
    }
  }

  return { action, email, markedForInactivation }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL DE SYNC
// ═══════════════════════════════════════════════════════════

/**
 * Sincronizar TODAS as subscrições da Guru para a nossa BD
 *
 * IMPORTANTE: Esta função APENAS LÊ da Guru e ESCREVE na nossa BD.
 * Nunca escreve, atualiza ou modifica dados na Guru.
 */
