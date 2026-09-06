import type { Types } from 'mongoose'

import { normalizeGuruStatus } from './sync/persistence'
import type { GuruStatus, GuruSubscription } from './sync/client'
import { subscriptionEmail } from './sync/client'

export type UserSnapshot = {
  _id: string | Types.ObjectId
  email: string
  guru?: {
    isTrial?: boolean
    status?: string
    subscriptionCode?: string
    trialStartedAt?: Date | string
    trialFinishedAt?: Date | string
    trialConvertedAt?: Date | string
  }
}

export type ProductSnapshot = {
  _id: string | Types.ObjectId
  userId?: string | Types.ObjectId
  status: string
  metadata?: { guruTrialExpired?: boolean; guruTrialPreviousStatus?: string }
}

export const TRIAL_STATUSES = new Set<GuruStatus>(['trial'])
export const MARK_STATUSES = new Set<GuruStatus>(['expired', 'canceled', 'pastdue', 'pending', 'refunded', 'suspended'])
export const RESTORE_STATUSES = new Set<GuruStatus>(['active', 'trial'])

export function policyError(code: string): Error { return new Error(code) }

export function normalizedCode(subscription: GuruSubscription): string | undefined {
  const code = subscription.subscription_code || subscription.code || subscription.id
  return typeof code === 'string' && code.trim() ? code.trim() : undefined
}

export function saneEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^@\s]+@[^@\s]+$/.test(value)
}

function validDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function dateValue(subscription: GuruSubscription, key: 'start' | 'finish'): unknown {
  const dates = subscription.dates as unknown as Record<string, unknown> | undefined
  if (key === 'start') return subscription.trial_started_at ?? dates?.started_at
  return subscription.trial_finished_at ?? dates?.finished_at ?? dates?.trial_finished_at
}

export function effectiveDates(subscription: GuruSubscription): { start?: Date; finish?: Date } {
  return {
    start: validDate(dateValue(subscription, 'start')),
    finish: validDate(dateValue(subscription, 'finish')),
  }
}

export function validateDateShape(subscription: GuruSubscription): void {
  const startRaw = dateValue(subscription, 'start')
  const finishRaw = dateValue(subscription, 'finish')
  const hasStart = startRaw !== undefined && startRaw !== null
  const hasFinish = finishRaw !== undefined && finishRaw !== null
  const dates = effectiveDates(subscription)
  if ((hasStart && !dates.start) || (hasFinish && !dates.finish) || (dates.start && dates.finish && dates.start > dates.finish)) {
    throw policyError('GURU_TRIAL_PROVIDER_DATES_INVALID')
  }
}

export function statusOf(subscription: GuruSubscription): GuruStatus {
  const status = normalizeGuruStatus(subscription?.last_status || subscription?.status)
  if (!status) throw policyError('GURU_TRIAL_PROVIDER_STATUS_INVALID')
  return status
}

export function signature(subscription: GuruSubscription): string {
  const dates = effectiveDates(subscription)
  return JSON.stringify({ status: statusOf(subscription), start: dates.start?.toISOString(), finish: dates.finish?.toISOString() })
}

export function validateResolved(subscription: GuruSubscription, expectedCode?: string, expectedEmail?: string): { status: GuruStatus; start: Date; finish: Date } {
  const status = statusOf(subscription)
  const code = normalizedCode(subscription)
  const email = subscriptionEmail(subscription)
  if (!code || !saneEmail(email) || (expectedCode && code !== expectedCode) || (expectedEmail && email !== expectedEmail)) throw policyError('GURU_TRIAL_PROVIDER_IDENTITY_INVALID')
  const dates = effectiveDates(subscription)
  if (!dates.start || !dates.finish || dates.start > dates.finish) throw policyError('GURU_TRIAL_PROVIDER_DATES_INVALID')
  return { status, start: dates.start, finish: dates.finish }
}

export function assertProviderCodeIdentity(owners: Map<string, string>, subscription: GuruSubscription): void {
  const code = normalizedCode(subscription)
  const email = subscriptionEmail(subscription)
  if (!code || !saneEmail(email)) throw policyError('GURU_TRIAL_PROVIDER_IDENTITY_INVALID')
  const owner = owners.get(code)
  if (owner && owner !== email) throw policyError('GURU_TRIAL_PROVIDER_CONFLICT')
  owners.set(code, email)
}

function expected(value: unknown): unknown { return value === undefined ? { $exists: false } : value }

export function userPredicate(user: UserSnapshot): Record<string, unknown> {
  const guru = user.guru || {}
  return {
    _id: user._id, email: user.email,
    'guru.isTrial': expected(guru.isTrial), 'guru.status': expected(guru.status),
    'guru.subscriptionCode': expected(guru.subscriptionCode),
    'guru.trialStartedAt': expected(guru.trialStartedAt), 'guru.trialFinishedAt': expected(guru.trialFinishedAt),
    'guru.trialConvertedAt': expected(guru.trialConvertedAt),
  }
}

export function productPredicate(product: ProductSnapshot, userId: string | Types.ObjectId): Record<string, unknown> {
  return {
    _id: product._id, userId, platform: 'curseduca', status: product.status,
    'metadata.guruTrialExpired': expected(product.metadata?.guruTrialExpired),
    'metadata.guruTrialPreviousStatus': expected(product.metadata?.guruTrialPreviousStatus),
  }
}
