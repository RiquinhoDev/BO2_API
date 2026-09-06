import logger from '../../utils/logger'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { runCheckExpiredTrials, runSyncTrialsFromGuru } from './guruTrialCheckExecution.service'
import { runGuruTrialCheck } from './guruTrialCheckPlan.service'
import type { GuruTrialCheckResult, GuruTrialRunOptions } from './guruTrial.types'
import { TrialNotEndedError, TrialUserNotFoundError } from './guruTrialErrors'

const TRIAL_WINDOW_DAYS = 7
const DAY_MS = 86400000

export interface TrialUser {
  _id: string
  email: string
  name: string
  guru: {
    status?: string
    isTrial?: boolean
    trialStartedAt?: Date
    trialFinishedAt?: Date
    trialConvertedAt?: Date
    subscriptionCode?: string
    offerId?: string
    productId?: string
  }
  daysRemaining: number
  trialStatus: 'active' | 'expiring_soon' | 'expired' | 'converted'
  eligibleForInactivation: boolean
}

export interface TrialStats {
  active: number
  expiringSoon: number
  expired: number
  converted: number
  total: number
}

export type CheckExpiredResult = GuruTrialCheckResult

export async function listTrials(): Promise<TrialUser[]> {
  const users = await User.find({
    $or: [
      { 'guru.isTrial': true },
      { 'guru.status': 'trial' },
      { 'guru.trialFinishedAt': { $exists: true } },
    ],
  }).select('email name guru').lean().exec()
  const now = Date.now()

  return users.map((u) => {
    const startMs = u.guru?.trialStartedAt ? new Date(u.guru.trialStartedAt).getTime() : null
    const trialEnd = u.guru?.trialFinishedAt
      ? new Date(u.guru.trialFinishedAt).getTime()
      : (startMs ? startMs + TRIAL_WINDOW_DAYS * DAY_MS : null)
    const daysRemaining = trialEnd ? Math.ceil((trialEnd - now) / DAY_MS) : 0
    const converted = !!u.guru?.trialConvertedAt
    const expired = !converted && trialEnd != null && trialEnd <= now
    const trialStatus: TrialUser['trialStatus'] = converted
      ? 'converted'
      : expired
        ? 'expired'
        : trialEnd && daysRemaining <= 2
          ? 'expiring_soon'
          : 'active'
    return {
      _id: u._id.toString(),
      email: u.email,
      name: u.name || '',
      guru: {
        ...u.guru,
        trialFinishedAt: u.guru?.trialFinishedAt || (trialEnd ? new Date(trialEnd) : undefined),
      },
      daysRemaining,
      trialStatus,
      eligibleForInactivation: expired,
    }
  })
}

export async function getTrialStats(): Promise<TrialStats> {
  const trials = await listTrials()
  return {
    active: trials.filter(t => t.trialStatus === 'active').length,
    expiringSoon: trials.filter(t => t.trialStatus === 'expiring_soon').length,
    expired: trials.filter(t => t.trialStatus === 'expired').length,
    converted: trials.filter(t => t.trialStatus === 'converted').length,
    total: trials.length,
  }
}

export async function checkExpiredTrials(options: GuruTrialRunOptions = {}): Promise<CheckExpiredResult> {
  return runCheckExpiredTrials(options)
}

export async function syncTrialsFromGuru(options: GuruTrialRunOptions = {}): Promise<{ synced: number; errors: number }> {
  return runSyncTrialsFromGuru(options)
}

export { runGuruTrialCheck }

async function markUserProductsForInactivation(
  userId: string | import('mongoose').Types.ObjectId,
  email: string,
): Promise<number> {
  const markStatus = async (previousStatus: 'ACTIVE' | 'QUARENTENA'): Promise<number> => {
    const result = await UserProduct.updateMany(
      { userId, platform: 'curseduca', status: previousStatus },
      { $set: {
        status: 'PARA_INATIVAR',
        'metadata.markedForInactivationAt': new Date(),
        'metadata.markedForInactivationReason': `Trial Guru expirado sem conversão (${email})`,
        'metadata.guruTrialExpired': true,
        'metadata.guruTrialPreviousStatus': previousStatus,
      } },
    )
    return result.modifiedCount || 0
  }
  return (await markStatus('ACTIVE')) + (await markStatus('QUARENTENA'))
}

export interface ManualInactivateResult {
  email: string
  marked: number
  eligible: boolean
}

export async function manuallyInactivateTrial(email: string): Promise<ManualInactivateResult> {
  const normalizedEmail = email.toLowerCase().trim()
  const user = await User.findOne({ email: normalizedEmail })
  if (!user) throw new TrialUserNotFoundError()
  const g: { trialStartedAt?: Date; trialFinishedAt?: Date } = user.guru || {}
  const startMs = g.trialStartedAt ? new Date(g.trialStartedAt).getTime() : null
  const finishMs = g.trialFinishedAt
    ? new Date(g.trialFinishedAt).getTime()
    : (startMs != null ? startMs + TRIAL_WINDOW_DAYS * DAY_MS : null)
  if (!(finishMs != null && Date.now() >= finishMs)) throw new TrialNotEndedError()

  await User.updateOne({ _id: user._id }, { $set: { 'guru.isTrial': false, 'guru.status': 'expired' } })
  const marked = await markUserProductsForInactivation(user._id, normalizedEmail)
  logger.info(`🔴 [GURU TRIALS] Inativação manual de ${normalizedEmail} → ${marked} UserProducts PARA_INATIVAR`)
  return { email: normalizedEmail, marked, eligible: true }
}

export interface RevertTrialResult {
  reverted: number
  userUpdated: boolean
  email: string
}

export async function revertTrial(email: string): Promise<RevertTrialResult> {
  const normalizedEmail = email.toLowerCase().trim()
  const user = await User.findOne({ email: normalizedEmail })
  if (!user) throw new Error(`Utilizador ${normalizedEmail} não encontrado`)
  const result = await UserProduct.updateMany(
    { userId: user._id, platform: 'curseduca', status: 'PARA_INATIVAR' },
    {
      $set: { status: 'ACTIVE', 'metadata.revertedAt': new Date(), 'metadata.revertedBy': 'manual_trial' },
      $unset: { 'metadata.markedForInactivationAt': 1, 'metadata.markedForInactivationReason': 1, 'metadata.guruTrialExpired': 1 },
    },
  )
  user.set('guru.isTrial', true)
  user.set('guru.status', 'trial')
  user.set('guru.trialConvertedAt', undefined)
  await user.save()
  logger.info(`↩️ [GURU TRIALS] Trial revertido para ${normalizedEmail} (${result.modifiedCount || 0} UserProducts)`)
  return { reverted: result.modifiedCount || 0, userUpdated: true, email: normalizedEmail }
}
