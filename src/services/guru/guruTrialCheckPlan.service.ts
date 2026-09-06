import type { Types } from 'mongoose'

import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { HttpError } from '../../security/errorHandling'
import { MAX_PROVIDER_READ_ITEMS, assertProviderReadBatchSize } from '../../security/providerReadBatchPolicy'
import { fetchAllSubscriptionsComplete, fetchSubscriptionById } from './guruSync.service'
import type { GuruPaginationLimits, GuruSubscription } from './sync/client'
import { subscriptionEmail } from './sync/client'
import type { GuruTrialCheckResult, GuruTrialPlan, GuruTrialRunOptions } from './guruTrial.types'

const PAGE_SIZE = 50
const MAX_PAGES = Math.ceil(MAX_PROVIDER_READ_ITEMS / PAGE_SIZE)
const VALID_STATUSES = new Set(['active', 'paid', 'trial', 'trialing', 'expired', 'canceled', 'cancelled'])
const MARK_STATUSES = new Set(['expired', 'canceled', 'cancelled'])
const RESTORE_STATUSES = new Set(['active', 'paid', 'trial', 'trialing'])

type UserSnapshot = {
  _id: string | Types.ObjectId
  email: string
  guru?: {
    subscriptionCode?: string
    trialStartedAt?: Date | string
    trialFinishedAt?: Date | string
  }
}

type ProductSnapshot = {
  _id: string | Types.ObjectId
  status: string
  metadata?: { guruTrialExpired?: boolean; guruTrialPreviousStatus?: string }
}

type Candidate = {
  user: UserSnapshot
  subscription: GuruSubscription
  status: string
  start: Date
  finish: Date
  products: ProductSnapshot[]
}

type Mutation = { kind: 'user' | 'product'; id: string | Types.ObjectId; update: Record<string, unknown> }

type Work = {
  candidates: Candidate[]
  mutations: Mutation[]
  plan: GuruTrialPlan
}

function incomplete(cause?: unknown): HttpError {
  return new HttpError({
    status: 503,
    code: 'GURU_TRIAL_EXECUTION_INCOMPLETE',
    publicMessage: 'Execução dos trials Guru incompleta; sem efeitos aplicados',
    cause,
  })
}

function capExceeded(): HttpError {
  return new HttpError({
    status: 413,
    code: 'GURU_TRIAL_PLAN_CAP_EXCEEDED',
    publicMessage: 'Plano dos trials Guru excede o limite de segurança',
  })
}

function providerLimits(options: GuruTrialRunOptions): GuruPaginationLimits {
  return {
    maxPages: MAX_PAGES,
    maxItems: MAX_PROVIDER_READ_ITEMS,
    beforeRequest: () => {
      options.phaseHooks?.providerStarted()
      options.phaseHooks?.assertOwnership?.()
    },
    requestSucceeded: () => options.phaseHooks?.providerSucceeded(),
  }
}

async function readAll(options: GuruTrialRunOptions): Promise<GuruSubscription[]> {
  try {
    return await fetchAllSubscriptionsComplete(undefined, providerLimits(options))
  } catch (error: unknown) {
    throw incomplete(error)
  }
}

async function readOne(options: GuruTrialRunOptions, code: string): Promise<GuruSubscription> {
  try {
    const result = await fetchSubscriptionById(code, providerLimits(options))
    if (!result) throw new Error('GURU_TRIAL_PROVIDER_NOT_FOUND')
    return result
  } catch (error: unknown) {
    throw incomplete(error)
  }
}

function normalizedCode(subscription: GuruSubscription): string | undefined {
  const code = subscription.subscription_code || subscription.id
  return typeof code === 'string' && code.trim() ? code.trim() : undefined
}

function validDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function effectiveDates(subscription: GuruSubscription): { start?: Date; finish?: Date } {
  const dates = subscription.dates as unknown as Record<string, unknown> | undefined
  return {
    start: validDate(subscription.trial_started_at || subscription.dates?.started_at),
    finish: validDate(subscription.trial_finished_at || dates?.finished_at || dates?.trial_finished_at),
  }
}

function statusOf(subscription: GuruSubscription): string {
  const status = typeof subscription.last_status === 'string' ? subscription.last_status.trim().toLowerCase() : ''
  if (!VALID_STATUSES.has(status)) throw incomplete(new Error('GURU_TRIAL_PROVIDER_STATUS_INVALID'))
  return status
}

function signature(subscription: GuruSubscription): string {
  const dates = effectiveDates(subscription)
  return JSON.stringify({ status: statusOf(subscription), start: dates.start?.toISOString(), finish: dates.finish?.toISOString() })
}

function effectiveTrials(subscriptions: GuruSubscription[]): GuruSubscription[] {
  const byEmail = new Map<string, GuruSubscription>()
  for (const subscription of subscriptions) {
    const rawStatus = typeof subscription.last_status === 'string' ? subscription.last_status.trim().toLowerCase() : ''
    if (!['trial', 'trialing'].includes(rawStatus)) continue
    statusOf(subscription)
    const email = subscriptionEmail(subscription)
    const code = normalizedCode(subscription)
    if (!email || !code) throw incomplete(new Error('GURU_TRIAL_PROVIDER_IDENTITY_INVALID'))
    const previous = byEmail.get(email)
    if (!previous) {
      byEmail.set(email, subscription)
      continue
    }
    if (signature(previous) !== signature(subscription)) throw incomplete(new Error('GURU_TRIAL_PROVIDER_CONFLICT'))
    if ((normalizedCode(subscription) || '').localeCompare(normalizedCode(previous) || '') < 0) byEmail.set(email, subscription)
  }
  const result = [...byEmail.values()].sort((left, right) => (subscriptionEmail(left) || '').localeCompare(subscriptionEmail(right) || ''))
  assertProviderReadBatchSize(result.length, 'guru-trials-effective')
  return result
}

async function readUsersByEmail(emails: string[]): Promise<UserSnapshot[]> {
  if (!emails.length) return []
  try {
    const query = User.find({ email: { $in: emails } }).select('_id email guru').limit(MAX_PROVIDER_READ_ITEMS + 1)
    const users = await query.lean().exec() as UserSnapshot[]
    if (users.length > MAX_PROVIDER_READ_ITEMS) throw capExceeded()
    const ordered = users.sort((left, right) => String(left._id).localeCompare(String(right._id)))
    const seen = new Map<string, string>()
    for (const user of ordered) {
      if (!user.email || user._id === undefined || user._id === null) throw incomplete(new Error('GURU_TRIAL_LOCAL_IDENTITY_INVALID'))
      const email = user.email.toLowerCase().trim()
      const id = String(user._id)
      const previous = seen.get(email)
      if (previous && previous !== id) throw incomplete(new Error('GURU_TRIAL_LOCAL_IDENTITY_CONFLICT'))
      seen.set(email, id)
    }
    return ordered
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error
    throw incomplete(error)
  }
}

async function readExpiredUsers(): Promise<UserSnapshot[]> {
  try {
    const users = await User.find({
      'guru.isTrial': true,
      'guru.trialFinishedAt': { $lte: new Date() },
      'guru.trialConvertedAt': { $exists: false },
    }).select('_id email guru').limit(MAX_PROVIDER_READ_ITEMS + 1).exec() as UserSnapshot[]
    if (users.length > MAX_PROVIDER_READ_ITEMS) throw capExceeded()
    const ordered = users.sort((left, right) => String(left._id).localeCompare(String(right._id)))
    for (const user of ordered) {
      if (!user.email || user._id === undefined || user._id === null || !user.guru?.subscriptionCode) {
        throw incomplete(new Error('GURU_TRIAL_LOCAL_IDENTITY_INVALID'))
      }
    }
    return ordered
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error
    throw incomplete(error)
  }
}

async function readProducts(userId: string | Types.ObjectId): Promise<ProductSnapshot[]> {
  try {
    const products = await UserProduct.find({
      userId,
      platform: 'curseduca',
      status: { $in: ['ACTIVE', 'QUARENTENA', 'PARA_INATIVAR'] },
    }).select('_id status metadata').limit(MAX_PROVIDER_READ_ITEMS + 1).exec() as ProductSnapshot[]
    if (products.length > MAX_PROVIDER_READ_ITEMS) throw capExceeded()
    const ordered = products.sort((left, right) => String(left._id).localeCompare(String(right._id)))
    const seen = new Set<string>()
    for (const product of ordered) {
      if (product._id === undefined || product._id === null || seen.has(String(product._id))
        || !['ACTIVE', 'QUARENTENA', 'PARA_INATIVAR'].includes(product.status)) {
        throw incomplete(new Error('GURU_TRIAL_LOCAL_PRODUCT_CONFLICT'))
      }
      seen.add(String(product._id))
    }
    return ordered
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error
    throw incomplete(error)
  }
}

function localDates(user: UserSnapshot): { start?: Date; finish?: Date } {
  return { start: validDate(user.guru?.trialStartedAt), finish: validDate(user.guru?.trialFinishedAt) }
}

function syncUpdate(subscription: GuruSubscription, start: Date, finish: Date): Record<string, unknown> {
  return {
    'guru.isTrial': true,
    'guru.status': 'trial',
    'guru.subscriptionCode': normalizedCode(subscription),
    'guru.trialStartedAt': start,
    'guru.trialFinishedAt': finish,
    'guru.lastSyncAt': new Date(),
  }
}

function expiryUpdate(status: string): Record<string, unknown> {
  if (RESTORE_STATUSES.has(status)) {
    return status === 'trial' || status === 'trialing'
      ? { 'guru.isTrial': true, 'guru.status': 'trial' }
      : { 'guru.isTrial': false, 'guru.status': 'active', 'guru.trialConvertedAt': new Date() }
  }
  return { 'guru.isTrial': false, 'guru.status': status }
}

function productUpdate(product: ProductSnapshot, status: string, email: string): Record<string, unknown> | undefined {
  if (MARK_STATUSES.has(status) && ['ACTIVE', 'QUARENTENA'].includes(product.status)) {
    return {
      $set: {
        status: 'PARA_INATIVAR',
        'metadata.markedForInactivationAt': new Date(),
        'metadata.markedForInactivationReason': `Trial Guru expirado sem conversão (${email})`,
        'metadata.guruTrialExpired': true,
        'metadata.guruTrialPreviousStatus': product.status,
      },
    }
  }
  if (RESTORE_STATUSES.has(status) && product.status === 'PARA_INATIVAR' && product.metadata?.guruTrialExpired === true
    && (product.metadata.guruTrialPreviousStatus === 'ACTIVE' || product.metadata.guruTrialPreviousStatus === 'QUARENTENA')) {
    const previous = product.metadata.guruTrialPreviousStatus
    return {
      $set: { status: previous, 'metadata.revertedAt': new Date(), 'metadata.revertedBy': 'guru_trial_provider_active', 'metadata.revertReason': 'Estado provider-active reparou marca de trial expirado' },
      $unset: { 'metadata.markedForInactivationAt': 1, 'metadata.markedForInactivationReason': 1, 'metadata.guruTrialExpired': 1, 'metadata.guruTrialPreviousStatus': 1 },
    }
  }
  return undefined
}

function buildPublicPlan(syncCount: number, candidates: Candidate[], mutations: Mutation[], dryRun: boolean): GuruTrialPlan {
  const converted = candidates.filter(candidate => ['active', 'paid'].includes(candidate.status)).length
  const stillInTrial = candidates.filter(candidate => ['trial', 'trialing'].includes(candidate.status)).length
  const markedForInactivation = candidates.length - converted - stillInTrial
  if (mutations.length > MAX_PROVIDER_READ_ITEMS) throw capExceeded()
  return {
    operation: 'guru-trial-check', dryRun, candidates: candidates.length, synced: syncCount,
    markedForInactivation, converted, stillInTrial, plannedMutations: mutations.length,
    errors: 0, limit: MAX_PROVIDER_READ_ITEMS, truncated: false, remaining: 0, anomaly: false,
  }
}

async function prepare(options: GuruTrialRunOptions): Promise<Work> {
  const subscriptions = effectiveTrials(await readAll(options))
  const resolvedSubscriptions: GuruSubscription[] = []
  for (const subscription of subscriptions) {
    let resolved = subscription
    const dates = effectiveDates(resolved)
    if (!dates.start || !dates.finish) {
      const code = normalizedCode(subscription)
      const email = subscriptionEmail(subscription)
      if (!code || !email) throw incomplete(new Error('GURU_TRIAL_PROVIDER_IDENTITY_INVALID'))
      const detail = await readOne(options, code)
      const detailEmail = subscriptionEmail(detail)
      if (!detailEmail || detailEmail !== email || normalizedCode(detail) !== code
        || !['trial', 'trialing'].includes(statusOf(detail))) {
        throw incomplete(new Error('GURU_TRIAL_PROVIDER_IDENTITY_INVALID'))
      }
      resolved = { ...subscription, ...detail }
    }
    const resolvedDates = effectiveDates(resolved)
    if (!resolvedDates.start || !resolvedDates.finish) throw incomplete(new Error('GURU_TRIAL_PROVIDER_DATES_INVALID'))
    resolvedSubscriptions.push(resolved)
  }
  const emails = resolvedSubscriptions.map(subscriptionEmail).filter((email): email is string => Boolean(email))
  const syncUsers = await readUsersByEmail(emails)
  const byEmail = new Map(syncUsers.map(user => [user.email.toLowerCase().trim(), user]))
  const syncRows: Array<{ user: UserSnapshot; subscription: GuruSubscription; start: Date; finish: Date }> = []
  for (const subscription of resolvedSubscriptions) {
    const email = subscriptionEmail(subscription)
    const user = byEmail.get(email || '')
    if (!user) continue
    const resolved = subscription
    const dates = effectiveDates(resolved)
    if (!dates.start || !dates.finish) throw incomplete(new Error('GURU_TRIAL_PROVIDER_DATES_INVALID'))
    syncRows.push({ user, subscription: resolved, start: dates.start, finish: dates.finish })
  }

  const existingUsers = await readExpiredUsers()
  const syncById = new Map(syncRows.map(row => [String(row.user._id), row]))
  const candidateUsers = new Map<string, UserSnapshot>()
  for (const user of existingUsers) candidateUsers.set(String(user._id), user)
  for (const row of syncRows) {
    if (row.finish.getTime() <= Date.now()) candidateUsers.set(String(row.user._id), row.user)
  }

  const candidates: Candidate[] = []
  for (const user of [...candidateUsers.values()].sort((left, right) => String(left._id).localeCompare(String(right._id)))) {
    const synced = syncById.get(String(user._id))
    const subscription = synced?.subscription || await readOne(options, user.guru?.subscriptionCode || '')
    const status = statusOf(subscription)
    const dates = effectiveDates(subscription)
    const fallbackDates = localDates(user)
    const start = dates.start || fallbackDates.start
    const finish = dates.finish || fallbackDates.finish
    if (!start || !finish) throw incomplete(new Error('GURU_TRIAL_PROVIDER_DATES_INVALID'))
    const products = await readProducts(user._id)
    candidates.push({ user, subscription, status, start, finish, products })
  }

  const mutations: Mutation[] = []
  for (const row of syncRows) {
    mutations.push({ kind: 'user', id: row.user._id, update: { $set: syncUpdate(row.subscription, row.start, row.finish) } })
  }
  for (const candidate of candidates) {
    for (const product of candidate.products) {
      const update = productUpdate(product, candidate.status, candidate.user.email)
      if (update) mutations.push({ kind: 'product', id: product._id, update })
    }
    if (MARK_STATUSES.has(candidate.status) || ['active', 'paid'].includes(candidate.status)) {
      mutations.push({ kind: 'user', id: candidate.user._id, update: { $set: expiryUpdate(candidate.status) } })
    }
  }
  if (mutations.length > MAX_PROVIDER_READ_ITEMS) throw capExceeded()
  return { candidates, mutations, plan: buildPublicPlan(syncRows.length, candidates, mutations, options.dryRun === true) }
}

async function apply(options: GuruTrialRunOptions, work: Work): Promise<void> {
  for (const mutation of work.mutations) {
    try {
      options.phaseHooks?.localMutationStarted()
      options.phaseHooks?.assertOwnership?.()
      if (mutation.kind === 'user') await User.updateOne({ _id: mutation.id }, mutation.update)
      else await UserProduct.updateOne({ _id: mutation.id }, mutation.update)
    } catch (error: unknown) {
      throw incomplete(error)
    }
  }
}

export async function runGuruTrialCheck(options: GuruTrialRunOptions = {}): Promise<GuruTrialCheckResult & { synced: number; dryRun?: true }> {
  const work = await prepare(options)
  if (options.dryRun !== true) await apply(options, work)
  return {
    checked: work.candidates.length,
    markedForInactivation: work.plan.markedForInactivation,
    converted: work.plan.converted,
    stillInTrial: work.plan.stillInTrial,
    errors: 0,
    synced: work.plan.synced,
    ...(options.dryRun === true ? { dryRun: true as const, plan: work.plan } : {}),
  }
}
