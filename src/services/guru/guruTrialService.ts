// ════════════════════════════════════════════════════════════
// 📁 src/services/guru/guruTrialService.ts
// Gestão de trials Guru — detecção, listagem, auto-inactivação
// ════════════════════════════════════════════════════════════

import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { fetchAllSubscriptionsComplete, fetchSubscriptionById } from './guruSync.service'

// Fim do trial: usar o trial_finished_at da Guru (autoritativo). A Guru só o
// devolve no endpoint POR SUBSCRIÇÃO (a lista omite-o), por isso o sync vai
// buscá-lo lá. TRIAL_WINDOW_DAYS é apenas fallback quando a Guru não dá fim.
const TRIAL_WINDOW_DAYS = 7
const DAY_MS = 86400000

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
  /** true quando já passaram 7 dias do início e não converteu → mostrar opção de inativar manualmente */
  eligibleForInactivation: boolean
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
    // Fim: trial_finished_at da Guru (autoritativo); fallback início + 7 dias.
    const startMs = u.guru?.trialStartedAt ? new Date(u.guru.trialStartedAt).getTime() : null
    const trialEnd = u.guru?.trialFinishedAt
      ? new Date(u.guru.trialFinishedAt).getTime()
      : (startMs ? startMs + TRIAL_WINDOW_DAYS * DAY_MS : null)
    const daysRemaining = trialEnd ? Math.ceil((trialEnd - now) / DAY_MS) : 0

    const converted = !!u.guru?.trialConvertedAt
    const expired = !converted && trialEnd != null && trialEnd <= now

    let trialStatus: TrialUser['trialStatus'] = 'active'
    if (converted) {
      trialStatus = 'converted'
    } else if (expired) {
      trialStatus = 'expired'
    } else if (trialEnd && daysRemaining <= 2) {
      trialStatus = 'expiring_soon'
    }

    return {
      _id: u._id.toString(),
      email: u.email,
      name: u.name || '',
      guru: {
        ...u.guru,
        // expor o fim efetivo (início + 7d) mesmo que ainda não esteja gravado
        trialFinishedAt: u.guru?.trialFinishedAt || (trialEnd ? new Date(trialEnd) : undefined),
      },
      daysRemaining,
      trialStatus,
      // só há opção de inativar quando passaram os 7 dias e não converteu
      eligibleForInactivation: expired,
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

        // A LISTA da Guru não traz os campos do trial; o endpoint por subscrição
        // traz (trial_started_at + trial_finished_at). Buscar os detalhes.
        let startRaw = sub.trial_started_at
        let finishRaw = sub.trial_finished_at
        if (!startRaw || !finishRaw) {
          const code = sub.subscription_code || sub.id
          if (code) {
            const full = await fetchSubscriptionById(code)
            startRaw = startRaw || full?.trial_started_at || (full as any)?.dates?.started_at
            finishRaw = finishRaw || full?.trial_finished_at
          }
        }
        if (startRaw) {
          const start = new Date(startRaw)
          if (!isNaN(start.getTime())) {
            user.set('guru.trialStartedAt', start)
            // Fim: trial_finished_at da Guru (autoritativo); fallback início + 7 dias
            const finish = finishRaw ? new Date(finishRaw) : new Date(start.getTime() + TRIAL_WINDOW_DAYS * DAY_MS)
            if (!isNaN(finish.getTime())) {
              user.set('guru.trialFinishedAt', finish)
            }
          }
        }
        user.set('guru.subscriptionCode', sub.subscription_code || sub.id)
        user.set('guru.lastSyncAt', new Date())

        await user.save()
        synced++
        console.log(`✅ [GURU TRIALS SYNC] ${email} → trial (início=${startRaw || 'N/A'}, fim=início+7d)`)
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

// ─────────────────────────────────────────────────────────────
// INATIVAR TRIAL MANUALMENTE (após os 7 dias)
// ─────────────────────────────────────────────────────────────
// Aciona o mesmo efeito que o checkExpired faz a um trial expirado sem
// conversão, mas disparado manualmente por trial (botão na UI que só aparece
// quando passaram 7 dias). Marca os UserProducts CursEduca PARA_INATIVAR —
// a inativação efetiva no CursEduca continua a passar pelo pipeline normal.

export interface ManualInactivateResult {
  email: string
  marked: number
  eligible: boolean
}

export async function manuallyInactivateTrial(email: string): Promise<ManualInactivateResult> {
  const normalizedEmail = email.toLowerCase().trim()

  const user = await User.findOne({ email: normalizedEmail })
  if (!user) {
    throw new Error(`Utilizador ${normalizedEmail} não encontrado`)
  }

  // Validar que o trial já terminou (não inativar um trial a meio).
  // Fim: trial_finished_at da Guru (autoritativo); fallback início + 7 dias.
  const g = (user as any).guru || {}
  const startMs = g.trialStartedAt ? new Date(g.trialStartedAt).getTime() : null
  const finishMs = g.trialFinishedAt
    ? new Date(g.trialFinishedAt).getTime()
    : (startMs != null ? startMs + TRIAL_WINDOW_DAYS * DAY_MS : null)
  const eligible = finishMs != null && Date.now() >= finishMs
  if (!eligible) {
    throw new Error(`Trial de ${normalizedEmail} ainda não terminou — inativação não permitida.`)
  }

  // Mesmo efeito que o ramo "expirado sem conversão" do checkExpired
  user.set('guru.isTrial', false)
  user.set('guru.status', 'expired')
  await user.save()

  const marked = await markUserProductsForInactivation(user._id as any, normalizedEmail)
  console.log(`🔴 [GURU TRIALS] Inativação manual de ${normalizedEmail} → ${marked} UserProducts PARA_INATIVAR`)

  return { email: normalizedEmail, marked, eligible: true }
}

// ─────────────────────────────────────────────────────────────
// REVERTER TRIAL (manual — para o caso de marcação errada)
// ─────────────────────────────────────────────────────────────

export interface RevertTrialResult {
  reverted: number          // UserProducts repostos ACTIVE
  userUpdated: boolean       // flags trial repostos no User
  email: string
}

export async function revertTrial(email: string): Promise<RevertTrialResult> {
  const normalizedEmail = email.toLowerCase().trim()

  const user = await User.findOne({ email: normalizedEmail })
  if (!user) {
    throw new Error(`Utilizador ${normalizedEmail} não encontrado`)
  }

  // 1. Repor UserProducts marcados PARA_INATIVAR (apenas os marcados por trial)
  const result = await (UserProduct as any).updateMany(
    {
      userId: user._id,
      platform: 'curseduca',
      status: 'PARA_INATIVAR',
    },
    {
      $set: {
        status: 'ACTIVE',
        'metadata.revertedAt': new Date(),
        'metadata.revertedBy': 'manual_trial',
      },
      $unset: {
        'metadata.markedForInactivationAt': 1,
        'metadata.markedForInactivationReason': 1,
        'metadata.guruTrialExpired': 1,
      },
    }
  )

  // 2. Repor flags trial no User (volta a tratar como trial activo)
  user.set('guru.isTrial', true)
  user.set('guru.status', 'trial')
  user.set('guru.trialConvertedAt', undefined)
  await user.save()

  console.log(`↩️ [GURU TRIALS] Trial revertido para ${normalizedEmail} (${result.modifiedCount || 0} UserProducts)`)

  return {
    reverted: result.modifiedCount || 0,
    userUpdated: true,
    email: normalizedEmail,
  }
}
