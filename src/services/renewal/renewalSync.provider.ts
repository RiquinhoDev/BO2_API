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

function firstScalarString(obj: unknown, paths: readonly string[]): string | null {
  for (const path of paths) {
    const value = getValue(obj, path)
    if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) {
      return String(value).trim()
    }
  }
  return null
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

function nextPageToken(data: Record<string, unknown>): string | null {
  const locations = ['page_info.next_page_token', 'pageInfo.nextPageToken', 'pagination.next_page_token', 'pagination.nextPageToken', 'next_page_token']
  const present = locations.filter(path => getValue(data, path) !== undefined)
  if (present.length > 1) {
    const values = present.map(path => getValue(data, path))
    if (new Set(values.map(value => typeof value === 'string' ? value : String(value))).size > 1) {
      throw new HttpError({ status: 502, code: 'RENEWAL_OFFER_PROVIDER_PAGINATION_INVALID', publicMessage: 'Paginação Hotmart inválida para ofertas de renovação' })
    }
  }
  if (present.length === 0) return null
  const value = getValue(data, present[0])
  if (value === null || value === '') return null
  if (typeof value !== 'string') {
    throw new HttpError({ status: 502, code: 'RENEWAL_OFFER_PROVIDER_PAGINATION_INVALID', publicMessage: 'Paginação Hotmart inválida para ofertas de renovação' })
  }
  return value.trim() || null
}

function hasMore(data: Record<string, unknown>): boolean | undefined {
  const values = [
    getValue(data, 'page_info.has_more'), getValue(data, 'page_info.hasMore'),
    getValue(data, 'pageInfo.hasMore'), getValue(data, 'pagination.has_more'),
    getValue(data, 'pagination.hasMore'), getValue(data, 'has_more'), getValue(data, 'hasMore'),
  ].filter(value => value !== undefined)
  if (values.length === 0) return undefined
  if (!values.every(value => typeof value === 'boolean') || new Set(values).size > 1) {
    throw new HttpError({ status: 502, code: 'RENEWAL_OFFER_PROVIDER_PAGINATION_INVALID', publicMessage: 'Paginação Hotmart inválida para ofertas de renovação' })
  }
  return values[0] as boolean
}

function extractOffer(item: unknown): { offerCode: string; offerName: string } | null {
  const offerCode = firstString(item, ['purchase.offer.code', 'purchase.offer.offer_code', 'purchase.offerCode', 'purchase.offer_code', 'offer.code', 'offer.offer_code', 'offerCode', 'offer_code'])
  if (!offerCode) return null
  const offerName = firstString(item, ['purchase.offer.name', 'purchase.offer.offer_name', 'purchase.offerName', 'purchase.offer_name', 'offer.name', 'offer.offer_name', 'offerName', 'offer_name'])
  return { offerCode, offerName: offerName || '' }
}

function productId(item: unknown): string | null {
  return firstScalarString(item, ['purchase.product.id', 'purchase.product.product_id', 'purchase.product.ucode', 'purchase.productId', 'purchase.product_id', 'product.id', 'product.product_id', 'product.ucode', 'productId', 'product_id'])
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
    const next = nextPageToken(data)
    const more = hasMore(data)
    if (acceptedSales + items.length > RENEWAL_OFFER_LIMIT) {
      throw new HttpError({ status: 413, code: 'RENEWAL_OFFER_PROVIDER_SALES_CAP_EXCEEDED', publicMessage: 'Leitura Hotmart excedeu o limite seguro' })
    }
    if (acceptedSales + items.length >= RENEWAL_OFFER_LIMIT && next) {
      throw new HttpError({ status: 413, code: 'RENEWAL_OFFER_PROVIDER_SALES_CAP_EXCEEDED', publicMessage: 'Leitura Hotmart excedeu o limite seguro' })
    }
    acceptedSales += items.length
    for (const item of items) {
      if (productId(item) !== ogiHotmartProductId) continue
      const identity = extractOffer(item)
      if (!identity) {
        throw new HttpError({ status: 422, code: 'RENEWAL_OFFER_PROVIDER_IDENTITY_INVALID', publicMessage: 'Identidade da oferta Hotmart inválida' })
      }
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
