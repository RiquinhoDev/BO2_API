import mongoose from 'mongoose'
import Product from '../../models/product/Product'
import RenewalOffer from '../../models/RenewalOffer'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { HttpError } from '../../security/errorHandling'
import type { CronExecutionPhaseHooks } from '../cron/scheduler/executionPhases'
import { parseOfferName, parseTurmaName } from './turmaParser'
import {
  RENEWAL_OFFER_LIMIT,
  type EnrichedHotmartOffer,
  type HotmartOfferSnapshot,
  type RenewalOfferOperation,
  type RenewalOfferSyncPlan,
} from './renewalSync.types'

const CHECKOUT_BASE_URL = 'https://pay.hotmart.com/D61245882D'
const DEACTIVATE_AFTER_DAYS = 35
const RENEWAL_PRICE_CEILING_EUR = 200

type PlainOffer = Record<string, unknown> & { _id: unknown; offerCode: string; offerName?: string }
type BuyerClassSnapshot = { className?: unknown; isActive?: unknown }
type BuyerSnapshot = {
  _id: unknown
  email?: unknown
  hotmart?: { enrolledClasses?: BuyerClassSnapshot[] }
}

function fail(code: string, publicMessage: string, status = 413): never {
  throw new HttpError({ status, code, publicMessage })
}

function assertBounded(count: number, code: string, message: string): void {
  if (count > RENEWAL_OFFER_LIMIT) fail(code, message)
}

function dateValue(value: unknown): number | null {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime()
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function classNumber(className: unknown): number | null {
  return typeof className === 'string' ? parseTurmaName(className).turmaNumber : null
}

function createSuggestion(offer: HotmartOfferSnapshot, usersByEmail: Map<string, BuyerSnapshot>, activeUserIds: Set<string> | null): Pick<EnrichedHotmartOffer, 'suggestedTurmas' | 'suggestionConfidence' | 'suggestionSampleSize'> {
  const tally = new Map<number, number>()
  let counted = 0
  for (const email of offer.buyerEmails) {
    const user = usersByEmail.get(email)
    if (!user || (activeUserIds && !activeUserIds.has(String(user._id)))) continue
    const classes = Array.isArray(user.hotmart?.enrolledClasses) ? user.hotmart.enrolledClasses : []
    const className = classes.find(entry => entry?.className && entry?.isActive !== false)?.className
      || classes.find(entry => entry?.className)?.className
    const turma = classNumber(className)
    if (turma === null) continue
    tally.set(turma, (tally.get(turma) || 0) + 1)
    counted += 1
  }
  const suggestedTurmas = [...tally.entries()]
    .map(([turmaNumber, count]) => ({ turmaNumber, count }))
    .sort((left, right) => right.count - left.count || left.turmaNumber - right.turmaNumber)
  const top = Math.max(0, ...suggestedTurmas.map(item => item.count))
  return {
    suggestedTurmas,
    suggestionConfidence: counted > 0 ? top / counted : 0,
    suggestionSampleSize: counted,
  }
}

async function loadBuyerContext(
  offers: readonly HotmartOfferSnapshot[],
  ogiProductObjectId: mongoose.Types.ObjectId | null,
  hooks?: CronExecutionPhaseHooks,
): Promise<{ usersByEmail: Map<string, BuyerSnapshot>; activeUserIds: Set<string> | null }> {
  const emails = [...new Set(offers.flatMap(offer => [...offer.buyerEmails]))].sort()
  if (emails.length === 0) return { usersByEmail: new Map(), activeUserIds: null }
  assertBounded(emails.length, 'RENEWAL_OFFER_LOCAL_BUYER_CAP_EXCEEDED', 'Leitura local das ofertas excedeu o limite seguro')
  hooks?.assertOwnership?.()
  const users = await User.find({ email: { $in: emails } })
    .select('_id email hotmart.enrolledClasses')
    .sort({ email: 1, _id: 1 })
    .limit(RENEWAL_OFFER_LIMIT + 1)
    .lean()
    .exec() as unknown as BuyerSnapshot[]
  assertBounded(users.length, 'RENEWAL_OFFER_LOCAL_BUYER_CAP_EXCEEDED', 'Leitura local das ofertas excedeu o limite seguro')
  const usersByEmail = new Map(users.flatMap(user => typeof user.email === 'string' ? [[user.email.toLowerCase(), user] as const] : []))
  if (!ogiProductObjectId || users.length === 0) return { usersByEmail, activeUserIds: null }
  hooks?.assertOwnership?.()
  const enrollments = await UserProduct.find({
    userId: { $in: users.map(user => user._id) },
    platform: 'hotmart',
    productId: ogiProductObjectId,
    status: 'ACTIVE',
  })
    .select('userId')
    .sort({ userId: 1, _id: 1 })
    .limit(RENEWAL_OFFER_LIMIT + 1)
    .lean()
    .exec()
  assertBounded(enrollments.length, 'RENEWAL_OFFER_LOCAL_BUYER_CAP_EXCEEDED', 'Leitura local das ofertas excedeu o limite seguro')
  return { usersByEmail, activeUserIds: new Set(enrollments.map(enrollment => String(enrollment.userId))) }
}

export async function enrichOffers(
  offers: readonly HotmartOfferSnapshot[],
  ogiProductObjectId: mongoose.Types.ObjectId | null,
  hooks?: CronExecutionPhaseHooks,
): Promise<EnrichedHotmartOffer[]> {
  const context = await loadBuyerContext(offers, ogiProductObjectId, hooks)
  return offers.map(offer => ({
    ...offer,
    ...createSuggestion(offer, context.usersByEmail, context.activeUserIds),
  }))
}

export async function resolveOgiProductObjectId(hooks?: CronExecutionPhaseHooks): Promise<mongoose.Types.ObjectId | null> {
  hooks?.assertOwnership?.()
  const ogiProduct = await Product.findOne({
    platform: 'hotmart',
    isActive: true,
    $or: [{ code: /^OGI/i }, { courseCode: /^OGI/i }, { name: /Grande Investimento/i }],
  }).select('_id').lean().exec()
  return ogiProduct?._id || null
}

export async function loadExistingOffers(hooks?: CronExecutionPhaseHooks): Promise<PlainOffer[]> {
  hooks?.assertOwnership?.()
  const rows = await RenewalOffer.find({})
    .sort({ offerCode: 1, _id: 1 })
    .limit(RENEWAL_OFFER_LIMIT + 1)
    .lean()
    .exec() as PlainOffer[]
  if (rows.length > RENEWAL_OFFER_LIMIT) {
    fail('RENEWAL_OFFER_LOCAL_SNAPSHOT_CAP_EXCEEDED', 'Leitura local das ofertas excedeu o limite seguro')
  }
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row._id || typeof row.offerCode !== 'string' || !row.offerCode.trim()) {
      fail('RENEWAL_OFFER_LOCAL_IDENTITY_INVALID', 'Identidade local da oferta inválida', 422)
    }
    if (seen.has(row.offerCode)) fail('RENEWAL_OFFER_LOCAL_IDENTITY_CONFLICT', 'Identidade local da oferta inconsistente', 422)
    seen.add(row.offerCode)
  }
  return rows
}

function observedUpdate(offer: EnrichedHotmartOffer, existing: PlainOffer | undefined, now: Date): Record<string, unknown> {
  const parsed = parseOfferName(offer.offerName || existing?.offerName || '')
  return {
    $set: {
      lastSeenAt: now,
      isActive: true,
      priceValue: offer.priceValue,
      currency: offer.currency,
      paymentModes: [...offer.paymentModes].sort(),
      salesCount: offer.salesCount,
      suggestedTurmas: offer.suggestedTurmas,
      suggestionConfidence: offer.suggestionConfidence,
      suggestionSampleSize: offer.suggestionSampleSize,
      ...(existing && !existing.offerName && offer.offerName ? { offerName: offer.offerName } : {}),
    },
    ...(existing ? {} : {
      $setOnInsert: {
        offerCode: offer.offerCode,
        offerName: offer.offerName || '',
        link: buildCheckoutLink(offer.offerCode),
        turmaNumbers: parsed.valid ? parsed.turmaNumbers : [],
        periodYYMM: parsed.periodYYMM,
        periodStart: parsed.periodStart,
        isRenewal: offer.priceValue !== null && offer.priceValue <= RENEWAL_PRICE_CEILING_EUR,
        source: 'hotmart_sync',
        isManuallyEdited: false,
      },
    }),
  }
}

function existingFilter(existing: PlainOffer): Record<string, unknown> {
  return {
    _id: existing._id,
    offerCode: existing.offerCode,
    isActive: existing.isActive,
    source: existing.source,
    isManuallyEdited: existing.isManuallyEdited,
    ...(existing.lastSeenAt ? { lastSeenAt: existing.lastSeenAt } : {}),
  }
}

export interface RenewalOfferPlanResult {
  operations: RenewalOfferOperation[]
  unknownNames: string[]
  plan: RenewalOfferSyncPlan
}

export function buildPlan(
  offers: readonly EnrichedHotmartOffer[],
  existingRows: readonly PlainOffer[],
  now: Date,
): RenewalOfferPlanResult {
  const localByCode = new Map(existingRows.map(row => [row.offerCode, row]))
  const providerCodes = new Set(offers.map(offer => offer.offerCode))
  const operations: RenewalOfferOperation[] = []
  const unknownNames: string[] = []

  for (const offer of offers) {
    const existing = localByCode.get(offer.offerCode)
    const parsed = parseOfferName(offer.offerName || existing?.offerName || '')
    if (!offer.offerName || !parsed.valid) unknownNames.push(offer.offerCode)
    if (!existing) {
      operations.push({ kind: 'create', code: offer.offerCode, document: {
        ...((observedUpdate(offer, undefined, now).$setOnInsert as Record<string, unknown>) || {}),
        priceValue: offer.priceValue,
        currency: offer.currency,
        paymentModes: [...offer.paymentModes].sort(),
        salesCount: offer.salesCount,
        suggestedTurmas: offer.suggestedTurmas,
        suggestionConfidence: offer.suggestionConfidence,
        suggestionSampleSize: offer.suggestionSampleSize,
        lastSeenAt: now,
      } })
      continue
    }
    operations.push({
      kind: existing.isActive === false ? 'reactivate' : 'update',
      code: offer.offerCode,
      id: existing._id,
      filter: existingFilter(existing),
      update: observedUpdate(offer, existing, now),
    })
  }

  const cutoff = new Date(now.getTime() - DEACTIVATE_AFTER_DAYS * 24 * 60 * 60 * 1000)
  for (const existing of existingRows) {
    if (providerCodes.has(existing.offerCode)) continue
    if (existing.isActive !== true || existing.source === 'manual' || existing.isManuallyEdited === true) continue
    if ((dateValue(existing.lastSeenAt) ?? Number.POSITIVE_INFINITY) >= cutoff.getTime()) continue
    const periodStart = dateValue(existing.periodStart)
    if (periodStart === null || periodStart > now.getTime()) continue
    operations.push({
      kind: 'deactivate',
      code: existing.offerCode,
      id: existing._id,
      filter: existingFilter(existing),
      update: { $set: { isActive: false } },
    })
  }

  const counts = {
    create: operations.filter(operation => operation.kind === 'create').length,
    update: operations.filter(operation => operation.kind === 'update').length,
    reactivate: operations.filter(operation => operation.kind === 'reactivate').length,
    deactivate: operations.filter(operation => operation.kind === 'deactivate').length,
  }
  const totalOperations = Object.values(counts).reduce((sum, value) => sum + value, 0)
  if (totalOperations > RENEWAL_OFFER_LIMIT) {
    fail('RENEWAL_OFFER_PLAN_CAP_EXCEEDED', 'Plano das ofertas excedeu o limite seguro')
  }
  return {
    operations,
    unknownNames: unknownNames.sort(),
    plan: {
      operation: 'renewal-offer-sync',
      dryRun: true,
      ...counts,
      unchanged: 0,
      totalOperations,
      limit: RENEWAL_OFFER_LIMIT,
      remaining: 0,
      truncated: false,
      anomaly: false,
    },
  }
}

export function buildCheckoutLink(offerCode: string): string {
  return `${CHECKOUT_BASE_URL}?off=${encodeURIComponent(offerCode)}&checkoutMode=10`
}
