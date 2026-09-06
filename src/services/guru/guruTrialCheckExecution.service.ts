import type { Types } from 'mongoose'

import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { HttpError } from '../../security/errorHandling'
import {
  MAX_PROVIDER_READ_ITEMS,
  assertProviderReadBatchSize,
} from '../../security/providerReadBatchPolicy'
import { fetchAllSubscriptionsComplete, fetchSubscriptionById } from './guruSync.service'
import type { GuruSubscription } from './sync/client'
import { subscriptionEmail } from './sync/client'
import type {
  GuruTrialCheckResult,
  GuruTrialPlan,
  GuruTrialRunOptions,
} from './guruTrial.types'
export { runGuruTrialCheck } from './guruTrialCheckPlan.service'

const TRIAL_WINDOW_DAYS = 7
const DAY_MS = 86400000
const GURU_PAGE_SIZE = 50
const MAX_GURU_PAGES = Math.ceil(MAX_PROVIDER_READ_ITEMS / GURU_PAGE_SIZE)

type LocalTrialUser = { _id: unknown; email: string }
type PreparedSync = { user: LocalTrialUser; subscription: GuruSubscription; startRaw?: string; finishRaw?: string }
type ExpiryUser = {
  _id: string | Types.ObjectId
  email: string
  guru?: { subscriptionCode?: string }
  set(path: string, value: unknown): void
  save(): Promise<unknown>
}
type ExpiryCandidate = {
  user: ExpiryUser
  currentStatus: string
}

function executionUnavailable(cause: unknown): HttpError {
  return new HttpError({
    status: 503,
    code: 'GURU_TRIAL_EXECUTION_INCOMPLETE',
    publicMessage: 'Execução dos trials Guru incompleta; sem efeitos aplicados',
    cause,
  })
}

function beforeProvider(options: GuruTrialRunOptions): void {
  options.phaseHooks?.providerStarted()
  options.phaseHooks?.assertOwnership?.()
}

function afterProvider(options: GuruTrialRunOptions): void {
  options.phaseHooks?.providerSucceeded()
}

function beforeMutation(options: GuruTrialRunOptions): void {
  options.phaseHooks?.localMutationStarted()
  options.phaseHooks?.assertOwnership?.()
}

async function readProvider<T>(
  options: GuruTrialRunOptions,
  read: () => Promise<T>,
): Promise<T> {
  beforeProvider(options)
  try {
    const value = await read()
    afterProvider(options)
    return value
  } catch (error: unknown) {
    throw executionUnavailable(error)
  }
}

function subscriptionSignature(subscription: GuruSubscription): string {
  return JSON.stringify({
    status: (subscription.last_status || '').toLowerCase(),
    started: subscription.trial_started_at || null,
    finished: subscription.trial_finished_at || null,
  })
}

function buildTrialSubscriptions(allSubscriptions: GuruSubscription[]): GuruSubscription[] {
  const byEmail = new Map<string, GuruSubscription>()
  for (const subscription of allSubscriptions) {
    const status = (subscription.last_status || '').toLowerCase()
    if (status !== 'trial' && status !== 'trialing') continue
    const email = subscriptionEmail(subscription)
    if (!email) throw executionUnavailable(new Error('GURU_TRIAL_PROVIDER_PLAN_INCOMPLETE'))
    const previous = byEmail.get(email)
    if (previous) {
      if (subscriptionSignature(previous) !== subscriptionSignature(subscription)) {
        throw executionUnavailable(new Error('GURU_TRIAL_PROVIDER_CONFLICT'))
      }
      const previousCode = previous.subscription_code || previous.id
      const currentCode = subscription.subscription_code || subscription.id
      if (currentCode.localeCompare(previousCode) < 0) byEmail.set(email, subscription)
      continue
    }
    byEmail.set(email, subscription)
  }
  const subscriptions = [...byEmail.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, subscription]) => subscription)
  assertProviderReadBatchSize(subscriptions.length, 'guru-trials-effective')
  return subscriptions
}

async function prepareSync(options: GuruTrialRunOptions): Promise<PreparedSync[]> {
  const allSubscriptions = await readProvider(options, () => fetchAllSubscriptionsComplete(undefined, {
    maxPages: MAX_GURU_PAGES,
    maxItems: MAX_PROVIDER_READ_ITEMS,
  }))
  const trialSubscriptions = buildTrialSubscriptions(allSubscriptions)
  const trialEmails = trialSubscriptions.map(subscriptionEmail).filter((email): email is string => Boolean(email))

  let localUsers: LocalTrialUser[]
  try {
    localUsers = trialEmails.length > 0
      ? await User.find({ email: { $in: trialEmails } }).select('_id email').lean().exec() as LocalTrialUser[]
      : []
  } catch (error: unknown) {
    throw executionUnavailable(error)
  }
  const usersByEmail = new Map(localUsers.map(user => [user.email.toLowerCase().trim(), user]))
  const prepared: PreparedSync[] = []

  for (const subscription of trialSubscriptions) {
    const email = subscriptionEmail(subscription)
    if (!email) throw executionUnavailable(new Error('GURU_TRIAL_PROVIDER_PLAN_INCOMPLETE'))
    const user = usersByEmail.get(email)
    if (!user) continue

    let startRaw = subscription.trial_started_at
    let finishRaw = subscription.trial_finished_at
    if (!startRaw || !finishRaw) {
      const code = subscription.subscription_code || subscription.id
      if (!code) throw executionUnavailable(new Error('GURU_TRIAL_PROVIDER_PLAN_INCOMPLETE'))
      const full = await readProvider(options, () => fetchSubscriptionById(code))
      if (!full) throw executionUnavailable(new Error('GURU_TRIAL_PROVIDER_PLAN_INCOMPLETE'))
      startRaw = startRaw || full.trial_started_at || full.dates?.started_at
      finishRaw = finishRaw || full.trial_finished_at
    }
    prepared.push({ user, subscription, startRaw, finishRaw })
  }
  assertProviderReadBatchSize(prepared.length, 'guru-trials-sync-mutations')
  return prepared
}

function buildSyncUpdate(prepared: PreparedSync): Record<string, unknown> {
  const { subscription, startRaw, finishRaw } = prepared
  const update: Record<string, unknown> = {
    'guru.isTrial': true,
    'guru.status': 'trial',
    'guru.subscriptionCode': subscription.subscription_code || subscription.id,
    'guru.lastSyncAt': new Date(),
  }
  if (startRaw) {
    const start = new Date(startRaw)
    if (!Number.isNaN(start.getTime())) {
      update['guru.trialStartedAt'] = start
      const finish = finishRaw
        ? new Date(finishRaw)
        : new Date(start.getTime() + TRIAL_WINDOW_DAYS * DAY_MS)
      if (!Number.isNaN(finish.getTime())) update['guru.trialFinishedAt'] = finish
    }
  }
  return update
}

export async function runSyncTrialsFromGuru(
  options: GuruTrialRunOptions = {},
): Promise<{ synced: number; errors: number }> {
  const prepared = await prepareSync(options)
  if (options.dryRun === true) return { synced: prepared.length, errors: 0 }

  let synced = 0
  let errors = 0
  for (const item of prepared) {
    beforeMutation(options)
    try {
      await User.updateOne({ _id: item.user._id }, { $set: buildSyncUpdate(item) })
      synced++
    } catch {
      errors++
    }
  }
  return { synced, errors }
}

function candidateMutationCost(currentStatus: string): number {
  return currentStatus === 'trial' || currentStatus === 'trialing' ? 2 : 3
}

function buildPlan(
  candidates: ExpiryCandidate[],
  dryRun: boolean,
): GuruTrialPlan {
  const converted = candidates.filter(candidate => ['active', 'paid'].includes(candidate.currentStatus)).length
  const stillInTrial = candidates.filter(candidate => ['trial', 'trialing'].includes(candidate.currentStatus)).length
  const markedForInactivation = candidates.length - converted - stillInTrial
  const plannedMutations = candidates.reduce((sum, candidate) => sum + candidateMutationCost(candidate.currentStatus), 0)
  if (plannedMutations > MAX_PROVIDER_READ_ITEMS) {
    throw new HttpError({
      status: 413,
      code: 'GURU_TRIAL_PLAN_CAP_EXCEEDED',
      publicMessage: 'Plano dos trials Guru excede o limite de segurança',
    })
  }
  return {
    operation: 'guru-trial-check',
    dryRun,
    candidates: candidates.length,
    synced: 0,
    markedForInactivation,
    converted,
    stillInTrial,
    plannedMutations,
    errors: 0,
    limit: MAX_PROVIDER_READ_ITEMS,
    truncated: false,
    remaining: 0,
    anomaly: false,
  }
}

export async function runCheckExpiredTrials(
  options: GuruTrialRunOptions = {},
): Promise<GuruTrialCheckResult> {
  let expiredTrials: ExpiryUser[]
  try {
    expiredTrials = await User.find({
      'guru.isTrial': true,
      'guru.trialFinishedAt': { $lte: new Date() },
      'guru.trialConvertedAt': { $exists: false },
    })
      .select('email name guru')
      .limit(MAX_PROVIDER_READ_ITEMS + 1)
      .exec() as ExpiryUser[]
  } catch (error: unknown) {
    throw executionUnavailable(error)
  }
  assertProviderReadBatchSize(expiredTrials.length, 'guru-trials-expired')
  expiredTrials = [...expiredTrials].sort((left, right) => String(left._id).localeCompare(String(right._id)))

  const candidates: ExpiryCandidate[] = []
  for (const user of expiredTrials) {
    const subCode = user.guru?.subscriptionCode
    if (!subCode) throw executionUnavailable(new Error('GURU_TRIAL_PROVIDER_PLAN_INCOMPLETE'))
    const currentSub = await readProvider(options, () => fetchSubscriptionById(subCode))
    if (!currentSub) throw executionUnavailable(new Error('GURU_TRIAL_PROVIDER_PLAN_INCOMPLETE'))
    const currentStatus = (currentSub.last_status || '').toLowerCase()
    if (!currentStatus) throw executionUnavailable(new Error('GURU_TRIAL_PROVIDER_PLAN_INCOMPLETE'))
    candidates.push({ user, currentStatus })
  }

  const plan = buildPlan(candidates, options.dryRun === true)
  if (options.dryRun === true) {
    return {
      checked: candidates.length,
      markedForInactivation: plan.markedForInactivation,
      converted: plan.converted,
      stillInTrial: plan.stillInTrial,
      errors: 0,
      plan,
    }
  }

  const result: GuruTrialCheckResult = {
    checked: candidates.length,
    markedForInactivation: 0,
    converted: 0,
    stillInTrial: 0,
    errors: 0,
  }
  for (const { user, currentStatus } of candidates) {
    if (currentStatus === 'active' || currentStatus === 'paid') {
      await revertUserProductsFromTrialInactivation(user._id, options)
      user.set('guru.isTrial', false)
      user.set('guru.trialConvertedAt', new Date())
      user.set('guru.status', 'active')
      beforeMutation(options)
      await user.save()
      result.converted++
    } else if (currentStatus === 'trial' || currentStatus === 'trialing') {
      await revertUserProductsFromTrialInactivation(user._id, options)
      result.stillInTrial++
    } else {
      const markedCount = await markUserProductsForInactivation(user._id, user.email, options)
      user.set('guru.isTrial', false)
      user.set('guru.status', currentStatus === 'canceled' || currentStatus === 'expired' ? currentStatus : 'expired')
      beforeMutation(options)
      await user.save()
      result.markedForInactivation += markedCount
    }
  }
  return result
}

async function markUserProductsForInactivation(
  userId: string | Types.ObjectId,
  email: string,
  options: GuruTrialRunOptions,
): Promise<number> {
  const markStatus = async (previousStatus: 'ACTIVE' | 'QUARENTENA'): Promise<number> => {
    beforeMutation(options)
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

async function revertUserProductsFromTrialInactivation(
  userId: string | Types.ObjectId,
  options: GuruTrialRunOptions,
): Promise<number> {
  const restoreStatus = async (previousStatus: 'ACTIVE' | 'QUARENTENA'): Promise<number> => {
    beforeMutation(options)
    const result = await UserProduct.updateMany(
      {
        userId,
        platform: 'curseduca',
        status: 'PARA_INATIVAR',
        'metadata.guruTrialExpired': true,
        'metadata.guruTrialPreviousStatus': previousStatus,
      },
      {
        $set: {
          status: previousStatus,
          'metadata.revertedAt': new Date(),
          'metadata.revertedBy': 'guru_trial_provider_active',
          'metadata.revertReason': 'Estado provider-active reparou marca de trial expirado',
        },
        $unset: {
          'metadata.markedForInactivationAt': 1,
          'metadata.markedForInactivationReason': 1,
          'metadata.guruTrialExpired': 1,
          'metadata.guruTrialPreviousStatus': 1,
        },
      },
    )
    return result.modifiedCount || 0
  }
  return (await restoreStatus('ACTIVE')) + (await restoreStatus('QUARENTENA'))
}
