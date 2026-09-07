import axios from 'axios'
import { HttpError } from '../../security/errorHandling'
import type { CronExecutionPhaseHooks } from '../cron/scheduler/executionPhases'
import {
  HOTMART_SALES_HISTORY_URL,
  RENEWAL_OFFER_LIMIT,
  RENEWAL_OFFER_MAX_PAGES,
  RENEWAL_OFFER_PAGE_SIZE,
  type HotmartOfferSnapshot,
} from './renewalSync.types'

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getValue(obj: unknown, path: string): unknown {
  let current: unknown = obj
  for (const key of path.split('.')) {
    const record = recordOf(current)
    if (!record) return undefined
    current = record[key]
  }
  return current
}

function firstString(obj: unknown, paths: readonly string[]): string | null {
  for (const path of paths) {
    const value = getValue(obj, path)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

const PRODUCT_ID_PATHS = [
  'purchase.product.id', 'purchase.product.product_id', 'purchase.product.ucode',
  'purchase.productId', 'purchase.product_id', 'product.id', 'product.product_id',
  'product.ucode', 'productId', 'product_id',
] as const
const OFFER_CODE_PATHS = [
  'purchase.offer.code', 'purchase.offer.offer_code', 'purchase.offerCode',
  'purchase.offer_code', 'offer.code', 'offer.offer_code', 'offerCode', 'offer_code',
] as const
const OFFER_NAME_PATHS = [
  'purchase.offer.name', 'purchase.offer.offer_name', 'purchase.offerName',
  'purchase.offer_name', 'offer.name', 'offer.offer_name', 'offerName', 'offer_name',
] as const
const TRANSACTION_ID_PATHS = [
  'purchase.transaction', 'purchase.transaction_id', 'purchase.transactionId',
  'transaction', 'transaction_id', 'transactionId',
] as const

function identityValue(
  item: unknown,
  paths: readonly string[],
  required: boolean,
  code: string,
): string | null {
  const values = paths
    .map(path => getValue(item, path))
    .filter(value => value !== undefined)
  if (values.some(value => (typeof value !== 'string' && typeof value !== 'number') || !String(value).trim())) {
    throw new HttpError({ status: 422, code, publicMessage: 'Identidade da oferta Hotmart inválida' })
  }
  const normalized = values.map(value => String(value).trim())
  const unique = [...new Set(normalized)]
  if (unique.length > 1) {
    throw new HttpError({ status: 422, code: 'RENEWAL_OFFER_PROVIDER_IDENTITY_CONFLICT', publicMessage: 'Identidade da oferta Hotmart inconsistente' })
  }
  if (required && unique.length === 0) {
    throw new HttpError({ status: 422, code, publicMessage: 'Identidade da oferta Hotmart inválida' })
  }
  return unique[0] || null
}

function providerError(data: Record<string, unknown>): boolean {
  if (data.success === false || data.partial === true || data.is_partial === true || data.incomplete === true) return true
  for (const key of ['error', 'errors', 'failure']) {
    const value = data[key]
    if (value !== undefined && value !== null && value !== false && value !== '') return true
  }
  return false
}

function salesItems(data: Record<string, unknown>): unknown[] {
  const candidates = ['items', 'data', 'sales', 'transactions', 'results']
  const present = candidates.filter(key => Object.prototype.hasOwnProperty.call(data, key))
  if (present.length !== 1 || !Array.isArray(data[present[0]])) {
    throw new HttpError({
      status: 502,
      code: 'RENEWAL_OFFER_PROVIDER_RESPONSE_INVALID',
      publicMessage: 'Resposta Hotmart inválida para ofertas de renovação',
    })
  }
  return data[present[0]] as unknown[]
}

function pagination(data: Record<string, unknown>): { next: string | null; more: boolean | undefined } {
  const containers = ['page_info', 'pageInfo', 'pagination'].filter(key => Object.prototype.hasOwnProperty.call(data, key))
  if (containers.length !== 1 || !recordOf(data[containers[0]])) {
    throw new HttpError({ status: 502, code: 'RENEWAL_OFFER_PROVIDER_PAGINATION_INVALID', publicMessage: 'Paginação Hotmart inválida para ofertas de renovação' })
  }
  const container = data[containers[0]] as Record<string, unknown>
  const allowedKeys = new Set(['next_page_token', 'nextPageToken', 'has_more', 'hasMore'])
  if (Object.keys(container).some(key => !allowedKeys.has(key))) {
    throw new HttpError({ status: 502, code: 'RENEWAL_OFFER_PROVIDER_PAGINATION_INVALID', publicMessage: 'Paginação Hotmart inválida para ofertas de renovação' })
  }
  const tokenValues = ['next_page_token', 'nextPageToken']
    .filter(key => Object.prototype.hasOwnProperty.call(container, key))
    .map(key => container[key])
  if (tokenValues.some(value => value !== null && (typeof value !== 'string' || !value.trim()))) {
    throw new HttpError({ status: 502, code: 'RENEWAL_OFFER_PROVIDER_PAGINATION_INVALID', publicMessage: 'Paginação Hotmart inválida para ofertas de renovação' })
  }
  const tokens = [...new Set(tokenValues.filter((value): value is string => typeof value === 'string').map(value => value.trim()).filter(Boolean))]
  if (tokens.length > 1 || (tokenValues.includes(null) && tokens.length > 0)) {
    throw new HttpError({ status: 502, code: 'RENEWAL_OFFER_PROVIDER_PAGINATION_INVALID', publicMessage: 'Paginação Hotmart inválida para ofertas de renovação' })
  }
  const moreValues = ['has_more', 'hasMore']
    .filter(key => Object.prototype.hasOwnProperty.call(container, key))
    .map(key => container[key])
  if (moreValues.some(value => typeof value !== 'boolean') || new Set(moreValues).size > 1) {
    throw new HttpError({ status: 502, code: 'RENEWAL_OFFER_PROVIDER_PAGINATION_INVALID', publicMessage: 'Paginação Hotmart inválida para ofertas de renovação' })
  }
  return { next: tokens[0] || null, more: moreValues[0] as boolean | undefined }
}

function extractOffer(item: unknown): { offerCode: string; offerName: string; transactionId: string } {
  if (!recordOf(item)) {
    throw new HttpError({ status: 422, code: 'RENEWAL_OFFER_PROVIDER_IDENTITY_INVALID', publicMessage: 'Identidade da oferta Hotmart inválida' })
  }
  const product = identityValue(item, PRODUCT_ID_PATHS, true, 'RENEWAL_OFFER_PROVIDER_IDENTITY_INVALID')
  const offerCode = identityValue(item, OFFER_CODE_PATHS, true, 'RENEWAL_OFFER_PROVIDER_IDENTITY_INVALID')
  const transactionId = identityValue(item, TRANSACTION_ID_PATHS, true, 'RENEWAL_OFFER_PROVIDER_IDENTITY_INVALID')
  const offerName = identityValue(item, OFFER_NAME_PATHS, false, 'RENEWAL_OFFER_PROVIDER_IDENTITY_INVALID')
  if (!product || !offerCode || !transactionId) {
    throw new HttpError({ status: 422, code: 'RENEWAL_OFFER_PROVIDER_IDENTITY_INVALID', publicMessage: 'Identidade da oferta Hotmart inválida' })
  }
  return { offerCode, offerName: offerName || '', transactionId }
}

function productId(item: unknown): string | null {
  return identityValue(item, PRODUCT_ID_PATHS, true, 'RENEWAL_OFFER_PROVIDER_IDENTITY_INVALID')
}

function paymentMode(item: unknown): string | null {
  return firstString(item, ['purchase.offer.payment_mode', 'offer.payment_mode', 'purchase.payment.type'])
}

function price(item: unknown): { value: number | null; currency: string | null } {
  const value = getValue(item, 'purchase.price.value') ?? getValue(item, 'price.value')
  return {
    value: typeof value === 'number' && Number.isFinite(value) ? value : null,
    currency: firstString(item, ['purchase.price.currency_code', 'price.currency_code']),
  }
}

function buyerEmail(item: unknown): string | null {
  const email = firstString(item, ['buyer.email', 'purchase.buyer.email'])
  return email?.toLowerCase() || null
}

function createSnapshot(offerCode: string, offerName: string): HotmartOfferSnapshot {
  return {
    offerCode,
    offerName,
    paymentModes: new Set<string>(),
    priceValue: null,
    currency: null,
    eurPriceCounts: new Map<number, number>(),
    salesCount: 0,
    buyerEmails: new Set<string>(),
  }
}

function collectSale(snapshot: HotmartOfferSnapshot, item: unknown, offerName: string): void {
  if (snapshot.offerName && offerName && snapshot.offerName !== offerName) {
    throw new HttpError({ status: 422, code: 'RENEWAL_OFFER_PROVIDER_IDENTITY_CONFLICT', publicMessage: 'Identidade da oferta Hotmart inconsistente' })
  }
  if (!snapshot.offerName && offerName) snapshot.offerName = offerName
  snapshot.salesCount += 1
  const mode = paymentMode(item)
  if (mode) snapshot.paymentModes.add(mode)
  const salePrice = price(item)
  if (salePrice.value !== null && salePrice.currency === 'EUR') {
    snapshot.eurPriceCounts.set(salePrice.value, (snapshot.eurPriceCounts.get(salePrice.value) || 0) + 1)
  }
  const email = buyerEmail(item)
  if (email) snapshot.buyerEmails.add(email)
}

function finalize(snapshots: Map<string, HotmartOfferSnapshot>): HotmartOfferSnapshot[] {
  for (const snapshot of snapshots.values()) {
    const eurValues = [...snapshot.eurPriceCounts.keys()]
    if (eurValues.length > 0) {
      snapshot.priceValue = Math.max(...eurValues)
      snapshot.currency = 'EUR'
    }
  }
  return [...snapshots.values()].sort((left, right) => left.offerCode.localeCompare(right.offerCode))
}

export async function fetchHotmartOffers(
  accessToken: string,
  ogiHotmartProductId: string,
  phaseHooks?: CronExecutionPhaseHooks,
): Promise<HotmartOfferSnapshot[]> {
  const offers = new Map<string, HotmartOfferSnapshot>()
  const seenTokens = new Set<string>()
  const seenTransactions = new Set<string>()
  let pageToken: string | null = null
  let acceptedSales = 0
  let page = 0

  while (true) {
    if (page >= RENEWAL_OFFER_MAX_PAGES) {
      throw new HttpError({ status: 413, code: 'RENEWAL_OFFER_PROVIDER_PAGE_CAP_EXCEEDED', publicMessage: 'Leitura Hotmart excedeu o limite seguro' })
    }
    page += 1
    phaseHooks?.assertOwnership?.()
    phaseHooks?.providerStarted()
    const response = await axios.get(HOTMART_SALES_HISTORY_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      params: { max_results: RENEWAL_OFFER_PAGE_SIZE, ...(pageToken ? { page_token: pageToken } : {}) },
      timeout: 30000,
    })
    phaseHooks?.providerSucceeded()
    const data = recordOf(response.data)
    if (!data || providerError(data)) {
      throw new HttpError({ status: 502, code: 'RENEWAL_OFFER_PROVIDER_RESPONSE_INVALID', publicMessage: 'Resposta Hotmart inválida para ofertas de renovação' })
    }
    const items = salesItems(data)
    if (items.length > RENEWAL_OFFER_PAGE_SIZE) {
      throw new HttpError({ status: 413, code: 'RENEWAL_OFFER_PROVIDER_PAGE_SIZE_EXCEEDED', publicMessage: 'Página Hotmart excedeu o limite seguro' })
    }
    const pageIdentities = items.map(item => extractOffer(item))
    const nextPage = pagination(data)
    const next = nextPage.next
    const more = nextPage.more
    if (acceptedSales + items.length > RENEWAL_OFFER_LIMIT) {
      throw new HttpError({ status: 413, code: 'RENEWAL_OFFER_PROVIDER_SALES_CAP_EXCEEDED', publicMessage: 'Leitura Hotmart excedeu o limite seguro' })
    }
    if (acceptedSales + items.length >= RENEWAL_OFFER_LIMIT && next) {
      throw new HttpError({ status: 413, code: 'RENEWAL_OFFER_PROVIDER_SALES_CAP_EXCEEDED', publicMessage: 'Leitura Hotmart excedeu o limite seguro' })
    }
    acceptedSales += items.length
    for (const [index, item] of items.entries()) {
      const identity = pageIdentities[index]
      if (seenTransactions.has(identity.transactionId)) {
        throw new HttpError({ status: 409, code: 'RENEWAL_OFFER_PROVIDER_SALE_DUPLICATE', publicMessage: 'Venda Hotmart repetida na paginação' })
      }
      seenTransactions.add(identity.transactionId)
      if (productId(item) !== ogiHotmartProductId) continue
      const snapshot = offers.get(identity.offerCode) || createSnapshot(identity.offerCode, identity.offerName)
      collectSale(snapshot, item, identity.offerName)
      offers.set(identity.offerCode, snapshot)
    }

    if (!next && more === true) {
      throw new HttpError({ status: 502, code: 'RENEWAL_OFFER_PROVIDER_PAGINATION_INVALID', publicMessage: 'Paginação Hotmart inválida para ofertas de renovação' })
    }
    if (next && more === false) {
      throw new HttpError({ status: 502, code: 'RENEWAL_OFFER_PROVIDER_PAGINATION_INVALID', publicMessage: 'Paginação Hotmart inválida para ofertas de renovação' })
    }
    if (!next) break
    if (seenTokens.has(next) || next === pageToken) {
      throw new HttpError({ status: 502, code: 'RENEWAL_OFFER_PROVIDER_PAGINATION_INVALID', publicMessage: 'Paginação Hotmart inválida para ofertas de renovação' })
    }
    seenTokens.add(next)
    if (page >= RENEWAL_OFFER_MAX_PAGES) {
      throw new HttpError({ status: 413, code: 'RENEWAL_OFFER_PROVIDER_PAGE_CAP_EXCEEDED', publicMessage: 'Leitura Hotmart excedeu o limite seguro' })
    }
    pageToken = next
  }

  return finalize(offers)
}

export { extractOffer, productId }
