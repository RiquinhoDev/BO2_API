// ════════════════════════════════════════════════════════════
// 📁 src/services/guru/guruTrialService.ts
// Gestão de trials Guru — detecção, listagem, auto-inactivação
// ════════════════════════════════════════════════════════════

import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { fetchAllSubscriptionsComplete, fetchSubscriptionById } from './guruSync.service'

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

export interface TrialUser {
  _id: string
  email: string
  name: string
  guru: {
    status: string
    isTrial: boolean
    trialStartedAt?: Date
    trialFinishedAt?: Date
    trialConvertedAt?: Date
    subscriptionCode: string
    offerId?: string
    productId?: string
  }
  daysRemaining: number
  trialStatus: 'active' | 'expiring_soon' | 'expired' | 'converted'
}

export interface TrialStats {
  active: number
  expiringSoon: number  // ≤ 2 dias
  expired: number
  converted: number
  total: number
}

export interface CheckExpiredResult {
  checked: number
  markedForInactivation: number
  converted: number
  stillInTrial: number
  errors: number
}

// ─────────────────────────────────────────────────────────────
// LISTAR TRIALS
// ─────────────────────────────────────────────────────────────

export async function listTrials(): Promise<TrialUser[]> {
  const users = await User.find({
    $or: [
      { 'guru.isTrial': true },
      { 'guru.status': 'trial' },
      { 'guru.trialFinishedAt': { $exists: true } }
    ]
  })
    .select('email name guru')
    .lean()
    .exec()

  const now = Date.now()

  return (users as any[]).map((u) => {
    const trialEnd = u.guru?.trialFinishedAt ? new Date(u.guru.trialFinishedAt).getTime() : null
    const daysRemaining = trialEnd ? Math.ceil((trialEnd - now) / 86400000) : 0

    let trialStatus: TrialUser['trialStatus'] = 'active'
    if (u.guru?.trialConvertedAt) {
      trialStatus = 'converted'
    } else if (trialEnd && trialEnd <= now) {
      trialStatus = 'expired'
    } else if (daysRemaining <= 2) {
      trialStatus = 'expiring_soon'
    }

    return {
      _id: u._id.toString(),
      email: u.email,
      name: u.name || '',
      guru: u.guru,
      daysRemaining,
      trialStatus,
    }
  })
}

// ─────────────────────────────────────────────────────────────
// ESTATÍSTICAS
// ─────────────────────────────────────────────────────────────

export async function getTrialStats(): Promise<TrialStats> {
  const trials = await listTrials()

  return {
    active: trials.filter((t) => t.trialStatus === 'active').length,
    expiringSoon: trials.filter((t) => t.trialStatus === 'expiring_soon').length,
    expired: trials.filter((t) => t.trialStatus === 'expired').length,
    converted: trials.filter((t) => t.trialStatus === 'converted').length,
    total: trials.length,
  }
}

// ─────────────────────────────────────────────────────────────
// VERIFICAR TRIALS EXPIRADOS → MARCAR PARA INATIVAÇÃO
// ─────────────────────────────────────────────────────────────

export async function checkExpiredTrials(): Promise<CheckExpiredResult> {
  const result: CheckExpiredResult = {
    checked: 0,
    markedForInactivation: 0,
    converted: 0,
    stillInTrial: 0,
    errors: 0,
  }

  // Buscar users com trial expirado mas ainda marcados como trial
  const expiredTrials = await User.find({
    'guru.isTrial': true,
    'guru.trialFinishedAt': { $lte: new Date() },
    'guru.trialConvertedAt': { $exists: false },
  })
    .select('email name guru')
    .exec()

  result.checked = expiredTrials.length
  console.log(`⏳ [GURU TRIALS] Verificando ${expiredTrials.length} trials expirados...`)

  for (const user of expiredTrials) {
    try {
      const subCode = user.guru?.subscriptionCode
      if (!subCode) {
        result.errors++
        continue
      }

      // Verificar status actual na API Guru
      const currentSub = await fetchSubscriptionById(subCode)
      const currentStatus = (currentSub?.last_status || '').toLowerCase()

      if (currentStatus === 'active' || currentStatus === 'paid') {
        // Converteu para pago!
        console.log(`✅ [GURU TRIALS] ${user.email} converteu para pago`)
        user.set('guru.isTrial', false)
        user.set('guru.trialConvertedAt', new Date())
        user.set('guru.status', 'active')
        await user.save()
        result.converted++
      } else if (currentStatus === 'trial' || currentStatus === 'trialing') {
        // Ainda em trial (API pode ter datas diferentes)
        console.log(`⏳ [GURU TRIALS] ${user.email} ainda em trial na API Guru`)
        result.stillInTrial++
      } else {
        // Trial expirou sem conversão → marcar para inativação
        console.log(`❌ [GURU TRIALS] ${user.email} trial expirado (status=${currentStatus}) → PARA_INATIVAR`)

        // Actualizar status do user
        user.set('guru.isTrial', false)
        user.set('guru.status', currentStatus === 'canceled' || currentStatus === 'expired' ? currentStatus : 'expired')
        await user.save()

        // Marcar UserProducts CursEduca como PARA_INATIVAR
        const markedCount = await markUserProductsForInactivation(user._id as any, user.email)
        result.markedForInactivation += markedCount
      }
    } catch (error: any) {
      console.error(`❌ [GURU TRIALS] Erro ao verificar ${user.email}:`, error.message)
      result.errors++
    }
  }

  console.log(`⏳ [GURU TRIALS] Resultado: ${JSON.stringify(result)}`)
  return result
}

// ─────────────────────────────────────────────────────────────
// SYNC TRIALS DA API GURU
// ─────────────────────────────────────────────────────────────

export async function syncTrialsFromGuru(): Promise<{ synced: number; errors: number }> {
  let synced = 0
  let errors = 0

  try {
    // Buscar todas subscrições da Guru
    const allSubs = await fetchAllSubscriptionsComplete()

    for (const sub of allSubs) {
      const status = (sub.last_status || '').toLowerCase()
      if (status !== 'trial' && status !== 'trialing') continue

      const email = sub.subscriber?.email?.toLowerCase()?.trim()
      if (!email) continue

      try {
        const user = await User.findOne({ email })
        if (!user) {
          console.log(`⏳ [GURU TRIALS SYNC] User ${email} não encontrado na BD — ignorado`)
          continue
        }

        // Actualizar campos trial
        user.set('guru.isTrial', true)
        user.set('guru.status', 'trial')
        if (sub.trial_started_at) {
          user.set('guru.trialStartedAt', new Date(sub.trial_started_at))
        }
        if (sub.trial_finished_at) {
          user.set('guru.trialFinishedAt', new Date(sub.trial_finished_at))
        }
        user.set('guru.subscriptionCode', sub.subscription_code || sub.id)
        user.set('guru.lastSyncAt', new Date())

        await user.save()
        synced++
        console.log(`✅ [GURU TRIALS SYNC] ${email} → trial (${sub.trial_started_at} → ${sub.trial_finished_at})`)
      } catch (err: any) {
        console.error(`❌ [GURU TRIALS SYNC] Erro ${email}:`, err.message)
        errors++
      }
    }
  } catch (err: any) {
    console.error('❌ [GURU TRIALS SYNC] Erro global:', err.message)
    errors++
  }

  return { synced, errors }
}

// ─────────────────────────────────────────────────────────────
// HELPER — Marcar UserProducts para inativação
// ─────────────────────────────────────────────────────────────

async function markUserProductsForInactivation(userId: any, email: string): Promise<number> {
  const result = await (UserProduct as any).updateMany(
    {
      userId,
      platform: 'curseduca',
      status: { $in: ['ACTIVE', 'QUARENTENA'] },
    },
    {
      $set: {
        status: 'PARA_INATIVAR',
        'metadata.markedForInactivationAt': new Date(),
        'metadata.markedForInactivationReason': `Trial Guru expirado sem conversão (${email})`,
        'metadata.guruTrialExpired': true,
      },
    }
  )

  return result.modifiedCount || 0
}
