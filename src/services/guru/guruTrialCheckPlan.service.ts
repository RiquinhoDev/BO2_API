import type { Types } from 'mongoose'

import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { HttpError } from '../../security/errorHandling'
import { MAX_PROVIDER_READ_ITEMS, assertProviderReadBatchSize } from '../../security/providerReadBatchPolicy'
import { fetchAllSubscriptionsComplete, fetchSubscriptionById } from './guruSync.service'
import { subscriptionEmail, type GuruPaginationLimits, type GuruStatus, type GuruSubscription } from './sync/client'
import type { GuruTrialCheckResult, GuruTrialPlan, GuruTrialRunOptions } from './guruTrial.types'
import {
  assertProviderCodeIdentity, effectiveDates, MARK_STATUSES, normalizedCode, policyError, productPredicate,
  RESTORE_STATUSES, signature, statusOf, TRIAL_STATUSES, userPredicate, validateResolved,
  type ProductSnapshot, type UserSnapshot, validateDateShape,
} from './guruTrialCheckPolicy'

const PAGE_SIZE = 50
const MAX_PAGES = Math.ceil(MAX_PROVIDER_READ_ITEMS / PAGE_SIZE)
type Candidate = {
  user: UserSnapshot
  subscription: GuruSubscription
  status: GuruStatus
  start: Date
  finish: Date
  products: ProductSnapshot[]
}

type SyncRow = { original: UserSnapshot; projected: UserSnapshot; subscription: GuruSubscription; start: Date; finish: Date }
type Mutation = { kind: 'user' | 'product'; id: string | Types.ObjectId; filter: Record<string, unknown>; update: Record<string, unknown>; countedMark?: boolean }

type Work = {
  candidates: Candidate[]
  mutations: Mutation[]
  plan: GuruTrialPlan
}
type ProviderBudget = { attempts: number }

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

function providerLimits(options: GuruTrialRunOptions, budget: ProviderBudget): GuruPaginationLimits {
  return {
    maxPages: MAX_PAGES,
    maxItems: MAX_PROVIDER_READ_ITEMS,
    beforeRequest: () => {
      if (budget.attempts >= MAX_PROVIDER_READ_ITEMS) throw capExceeded()
      budget.attempts += 1
      options.phaseHooks?.providerStarted()
      options.phaseHooks?.assertOwnership?.()
    },
    requestSucceeded: () => options.phaseHooks?.providerSucceeded(),
  }
}

async function readAll(options: GuruTrialRunOptions, budget: ProviderBudget): Promise<GuruSubscription[]> {
  try {
    return await fetchAllSubscriptionsComplete(undefined, providerLimits(options, budget))
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error
    throw incomplete(error)
  }
}

async function readOne(options: GuruTrialRunOptions, code: string, budget: ProviderBudget): Promise<GuruSubscription> {
  if (!code.trim()) throw policyError('GURU_TRIAL_PROVIDER_IDENTITY_INVALID')
  try {
    const result = await fetchSubscriptionById(code, providerLimits(options, budget))
    if (!result) throw new Error('GURU_TRIAL_PROVIDER_NOT_FOUND')
    return result
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error
    throw incomplete(error)
  }
}

function effectiveTrials(subscriptions: GuruSubscription[], codeOwners: Map<string, string>): GuruSubscription[] {
  const byEmail = new Map<string, GuruSubscription>()
  for (const subscription of subscriptions) {
    const status = statusOf(subscription)
    const email = subscriptionEmail(subscription)
    const code = normalizedCode(subscription)
    if (!email || !code) throw policyError('GURU_TRIAL_PROVIDER_IDENTITY_INVALID')
    assertProviderCodeIdentity(codeOwners, subscription)
    validateDateShape(subscription)
    if (!TRIAL_STATUSES.has(status)) continue
    const previous = byEmail.get(email)
    if (!previous) {
      byEmail.set(email, subscription)
      continue
    }
    if (signature(previous) !== signature(subscription)) throw policyError('GURU_TRIAL_PROVIDER_CONFLICT')
    if ((normalizedCode(subscription) || '').localeCompare(normalizedCode(previous) || '') < 0) byEmail.set(email, subscription)
  }
  const result = [...byEmail.values()].sort((left, right) => (subscriptionEmail(left) || '').localeCompare(subscriptionEmail(right) || ''))
  assertProviderReadBatchSize(result.length, 'guru-trials-effective')
  return result
}

async function readUsersByEmail(emails: string[]): Promise<UserSnapshot[]> {
  if (!emails.length) return []
  try {
    const query = User.find({ email: { $in: emails } }).sort({ _id: 1 }).select('_id email guru').limit(MAX_PROVIDER_READ_ITEMS + 1)
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

async function readExpiredUsers(now: Date): Promise<UserSnapshot[]> {
  try {
    const users = await User.find({
      'guru.isTrial': true,
      'guru.trialFinishedAt': { $lte: now },
      'guru.trialConvertedAt': { $exists: false },
    }).sort({ _id: 1 }).select('_id email guru').limit(MAX_PROVIDER_READ_ITEMS + 1).exec() as UserSnapshot[]
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

const MAX_LOCAL_PRODUCT_READ_ITEMS = MAX_PROVIDER_READ_ITEMS

async function readProducts(userIds: Array<string | Types.ObjectId>): Promise<Map<string, ProductSnapshot[]>> {
  const grouped = new Map<string, ProductSnapshot[]>()
  if (!userIds.length) return grouped
  try {
    const products = await UserProduct.find({
      userId: { $in: userIds },
      platform: 'curseduca',
      status: { $in: ['ACTIVE', 'QUARENTENA', 'PARA_INATIVAR'] },
    }).select('_id userId status metadata').limit(MAX_LOCAL_PRODUCT_READ_ITEMS + 1).sort({ _id: 1 }).exec() as ProductSnapshot[]
    if (products.length > MAX_LOCAL_PRODUCT_READ_ITEMS) throw capExceeded()
    const ordered = products.sort((left, right) => String(left._id).localeCompare(String(right._id)))
    const seen = new Set<string>()
    for (const product of ordered) {
      if (product._id === undefined || product._id === null || seen.has(String(product._id))
        || !['ACTIVE', 'QUARENTENA', 'PARA_INATIVAR'].includes(product.status)) {
        throw incomplete(new Error('GURU_TRIAL_LOCAL_PRODUCT_CONFLICT'))
      }
      seen.add(String(product._id))
      const userId = product.userId === undefined || product.userId === null
        ? userIds.length === 1 ? String(userIds[0]) : undefined
        : String(product.userId)
      if (!userId || !userIds.some(id => String(id) === userId)) throw incomplete(new Error('GURU_TRIAL_LOCAL_PRODUCT_IDENTITY_INVALID'))
      const list = grouped.get(userId) || []
      list.push(product)
      grouped.set(userId, list)
    }
    return grouped
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error
    throw incomplete(error)
  }
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

function expiryUpdate(status: GuruStatus): Record<string, unknown> {
  if (RESTORE_STATUSES.has(status)) {
    return status === 'trial'
      ? { 'guru.isTrial': true, 'guru.status': 'trial' }
      : { 'guru.isTrial': false, 'guru.status': 'active', 'guru.trialConvertedAt': new Date() }
  }
  return { 'guru.isTrial': false, 'guru.status': status === 'canceled' ? 'canceled' : 'expired' }
}

function productUpdate(product: ProductSnapshot, status: GuruStatus, email: string): Record<string, unknown> | undefined {
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
  const converted = candidates.filter(candidate => candidate.status === 'active').length
  const stillInTrial = candidates.filter(candidate => TRIAL_STATUSES.has(candidate.status)).length
  const markedForInactivation = mutations.filter(mutation => mutation.countedMark).length
  if (mutations.length > MAX_PROVIDER_READ_ITEMS) throw capExceeded()
  return {
    operation: 'guru-trial-check', dryRun, candidates: candidates.length, synced: syncCount,
    markedForInactivation, converted, stillInTrial, plannedMutations: mutations.length,
    errors: 0, limit: MAX_PROVIDER_READ_ITEMS, truncated: false, remaining: 0, anomaly: false,
  }
}

function projectedUser(user: UserSnapshot, row: { subscription: GuruSubscription; start: Date; finish: Date }): UserSnapshot {
  return {
    ...user,
    guru: {
      ...(user.guru || {}),
      isTrial: true,
      status: 'trial',
      subscriptionCode: normalizedCode(row.subscription),
      trialStartedAt: row.start,
      trialFinishedAt: row.finish,
    },
  }
}

async function prepare(options: GuruTrialRunOptions): Promise<Work> {
  const now = new Date(Date.now())
  const providerBudget: ProviderBudget = { attempts: 0 }
  const codeOwners = new Map<string, string>()
  const subscriptions = effectiveTrials(await readAll(options, providerBudget), codeOwners)
  const resolvedSubscriptions: GuruSubscription[] = []
  for (const subscription of subscriptions) {
    let resolved = subscription
    const dates = effectiveDates(subscription)
    if (!dates.start || !dates.finish) {
      const code = normalizedCode(subscription)
      const email = subscriptionEmail(subscription)
      if (!code || !email) throw incomplete(new Error('GURU_TRIAL_PROVIDER_IDENTITY_INVALID'))
      const detail = await readOne(options, code, providerBudget)
      const detailInfo = validateResolved(detail, code, email)
      if (!TRIAL_STATUSES.has(detailInfo.status)) throw policyError('GURU_TRIAL_PROVIDER_STATUS_INVALID')
      resolved = { ...subscription, ...detail }
    }
    validateResolved(resolved)
    assertProviderCodeIdentity(codeOwners, resolved)
    resolvedSubscriptions.push(resolved)
  }

  const emails = resolvedSubscriptions.map(subscriptionEmail).filter((email): email is string => Boolean(email))
  const syncUsers = await readUsersByEmail(emails)
  const byEmail = new Map(syncUsers.map(user => [user.email.toLowerCase().trim(), user]))
  const syncRows: SyncRow[] = []
  for (const subscription of resolvedSubscriptions) {
    const email = subscriptionEmail(subscription)
    const user = byEmail.get(email || '')
    if (!user) continue
    const { start, finish } = validateResolved(subscription)
    const row = { original: user, projected: user, subscription, start, finish }
    row.projected = projectedUser(user, row)
    syncRows.push(row)
  }

  const existingUsers = await readExpiredUsers(now)
  const syncById = new Map(syncRows.map(row => [String(row.original._id), row]))
  const candidateUsers = new Map<string, UserSnapshot>()
  for (const user of existingUsers) {
    if (user.guru?.isTrial !== false && !user.guru?.trialConvertedAt) candidateUsers.set(String(user._id), user)
  }
  for (const row of syncRows) {
    if (row.finish.getTime() <= now.getTime() && !row.projected.guru?.trialConvertedAt) candidateUsers.set(String(row.original._id), row.projected)
    else candidateUsers.delete(String(row.original._id))
  }

  const candidates: Candidate[] = []
  for (const user of [...candidateUsers.values()].sort((left, right) => String(left._id).localeCompare(String(right._id)))) {
    const synced = syncById.get(String(user._id))
    const code = normalizedCode(synced?.subscription || ({ subscription_code: user.guru?.subscriptionCode } as GuruSubscription)) || ''
    const detail = await readOne(options, code, providerBudget)
    const info = validateResolved(detail, code, user.email.toLowerCase().trim())
    if (TRIAL_STATUSES.has(info.status) && info.finish.getTime() > now.getTime()) continue
    const subscription = detail
    assertProviderCodeIdentity(codeOwners, subscription)
    candidates.push({ user, subscription, status: info.status, start: info.start, finish: info.finish, products: [] })
  }

  const products = await readProducts(candidates.map(candidate => candidate.user._id))
  for (const candidate of candidates) candidate.products = products.get(String(candidate.user._id)) || []

  const mutations: Mutation[] = []
  for (const row of syncRows) {
    mutations.push({
      kind: 'user', id: row.original._id, filter: userPredicate(row.original),
      update: { $set: syncUpdate(row.subscription, row.start, row.finish) },
    })
  }
  for (const candidate of candidates) {
    for (const product of candidate.products) {
      const update = productUpdate(product, candidate.status, candidate.user.email)
      if (update) mutations.push({ kind: 'product', id: product._id, filter: productPredicate(product, candidate.user._id), update, countedMark: MARK_STATUSES.has(candidate.status) })
    }
    if (MARK_STATUSES.has(candidate.status) || candidate.status === 'active') {
      mutations.push({ kind: 'user', id: candidate.user._id, filter: userPredicate(candidate.user), update: { $set: expiryUpdate(candidate.status) } })
    }
  }
  if (mutations.length > MAX_PROVIDER_READ_ITEMS) throw capExceeded()
  return { candidates, mutations, plan: buildPublicPlan(syncRows.length, candidates, mutations, options.dryRun === true) }
}

function matched(result: unknown): number {
  const record = result && typeof result === 'object' ? result as Record<string, unknown> : {}
  if (record.acknowledged !== true || record.matchedCount !== 1
    || typeof record.modifiedCount !== 'number' || !Number.isSafeInteger(record.modifiedCount) || record.modifiedCount !== 1) {
    throw new Error('GURU_TRIAL_LOCAL_WRITE_CONFLICT')
  }
  return record.matchedCount
}

async function apply(options: GuruTrialRunOptions, work: Work): Promise<number> {
  let marked = 0
  for (const mutation of work.mutations) {
    try {
      options.phaseHooks?.localMutationStarted()
      options.phaseHooks?.assertOwnership?.()
      const result = mutation.kind === 'user'
        ? await User.updateOne(mutation.filter, mutation.update)
        : await UserProduct.updateOne(mutation.filter, mutation.update)
      const count = matched(result)
      if (mutation.countedMark) marked += count
    } catch (error: unknown) {
      throw incomplete(error)
    }
  }
  return marked
}

export async function runGuruTrialCheck(options: GuruTrialRunOptions = {}): Promise<GuruTrialCheckResult & { synced: number; dryRun?: true }> {
  try {
    const work = await prepare(options)
    const marked = options.dryRun === true ? work.plan.markedForInactivation : await apply(options, work)
    return {
      checked: work.candidates.length,
      markedForInactivation: marked,
      converted: work.plan.converted,
      stillInTrial: work.plan.stillInTrial,
      errors: 0,
      synced: work.plan.synced,
      ...(options.dryRun === true ? { dryRun: true as const, plan: work.plan } : {}),
    }
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error
    throw incomplete(error)
  }
}
