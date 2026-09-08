import axios from 'axios'
import type { IHotmartSale } from '../../models/HotmartSaleHistory'
import { assertMainParityOwnership } from './mainParityExecution'

const HOTMART_SALES_HISTORY_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
function getValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[key]
  }, obj)
}

export function firstString(obj: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const value = getValue(obj, path)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export function firstScalarString(obj: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const value = getValue(obj, path)
    if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) {
      return String(value).trim()
    }
  }
  return null
}

export function toDate(raw: unknown): Date | null {
  const n = typeof raw === 'string' ? Number(raw) : raw
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? new Date(n) : null
}

export function extractOfferFromSale(item: unknown): { offerCode: string | null; offerName: string | null } {
  const offerCode = firstString(item, [
    'purchase.offer.code',
    'purchase.offer.offer_code',
    'purchase.offerCode',
    'purchase.offer_code',
    'offer.code',
    'offer.offer_code'
  ])
  const offerName = firstString(item, [
    'purchase.offer.name',
    'purchase.offer.offer_name',
    'purchase.offerName',
    'purchase.offer_name',
    'offer.name',
    'offer.offer_name'
  ])
  return { offerCode, offerName }
}

export function extractProductIdFromSale(item: unknown): string | null {
  return firstScalarString(item, [
    'purchase.product.id',
    'purchase.product.product_id',
    'purchase.product.ucode',
    'purchase.productId',
    'purchase.product_id',
    'product.id',
    'product.product_id',
    'product.ucode',
    'productId',
    'product_id'
  ])
}

export function extractPrice(item: unknown): { value: number | null; currency: string | null } {
  const value = getValue(item, 'purchase.price.value') ?? getValue(item, 'price.value')
  const currency = firstString(item, ['purchase.price.currency_code', 'price.currency_code'])
  return {
    value: typeof value === 'number' ? value : null,
    currency: currency || null
  }
}

export function extractPaymentMode(item: unknown): string | null {
  return firstString(item, ['purchase.offer.payment_mode', 'offer.payment_mode', 'purchase.payment.type'])
}

export function extractBuyerEmail(item: unknown): string | null {
  const email = firstString(item, ['buyer.email', 'purchase.buyer.email'])
  return email ? email.toLowerCase() : null
}

export function extractSalesItems(responseData: unknown): unknown[] {
  const candidates = ['items', 'data', 'sales', 'transactions', 'results']
    .map((path) => getValue(responseData, path))
  const items = candidates.find(Array.isArray)
  return items || []
}

export function extractSalesPageItems(responseData: unknown, requestedLimit: number): unknown[] {
  if (!responseData || typeof responseData !== 'object') {
    throw new Error('HOTMART_SALES_INVALID_RESPONSE')
  }
  const candidates = ['items', 'data', 'sales', 'transactions', 'results']
    .map((path) => getValue(responseData, path))
  const items = candidates.find(Array.isArray)
  if (!items) throw new Error('HOTMART_SALES_INVALID_RESPONSE')
  if (items.length > requestedLimit) {
    throw new Error('HOTMART_SALES_PAGE_EXCEEDS_REQUESTED_LIMIT')
  }
  return items
}

export function extractNextPageToken(responseData: unknown): string | null {
  return firstString(responseData, [
    'page_info.next_page_token', 'pageInfo.nextPageToken',
    'pagination.next_page_token', 'pagination.nextPageToken', 'next_page_token',
  ])
}

export function parseSaleItem(item: unknown): IHotmartSale {
  const offer = extractOfferFromSale(item)
  const price = extractPrice(item)
  return {
    hotmartProductId: extractProductIdFromSale(item),
    productName: firstString(item, ['product.name', 'productName', 'product_name']),
    transaction: firstString(item, ['purchase.transaction', 'transaction']),
    offerCode: offer.offerCode,
    offerName: offer.offerName,
    transactionStatus: firstString(item, ['purchase.status', 'status']),
    approvedDate: toDate(getValue(item, 'purchase.approved_date') ?? getValue(item, 'approved_date')),
    orderDate: toDate(getValue(item, 'purchase.order_date') ?? getValue(item, 'order_date')),
    priceValue: price.value,
    currency: price.currency,
    paymentMode: extractPaymentMode(item)
  }
}

export async function requestSalesPage(accessToken: string, params: Record<string, unknown>) {
  const maxRetries = 4
  let attempt = 0

  while (true) {
    try {
      assertMainParityOwnership()
      return await axios.get(HOTMART_SALES_HISTORY_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params,
        timeout: 20000
      })
    } catch (error: unknown) {
      if (!axios.isAxiosError(error) || error.response?.status !== 429 || attempt >= maxRetries) throw error
      const retryAfter = Number(error.response.headers?.['retry-after'])
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * Math.pow(2, attempt)
      await sleep(delay)
      attempt += 1
    }
  }
}
