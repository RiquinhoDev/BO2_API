import axios from 'axios'
import RenewalOffer from '../../models/RenewalOffer'
import { getHotmartAccessToken } from '../syncUtilizadoresServices/hotmartServices/hotmart.helpers'
import { parseOfferName } from './turmaParser'

const HOTMART_SALES_HISTORY_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'
const CHECKOUT_BASE_URL = 'https://pay.hotmart.com/D61245882D'
const DEACTIVATE_AFTER_DAYS = 35

export interface RenewalSyncReport {
  upserted: number
  deactivated: number
  unknownNames: string[]
}

interface HotmartOfferSnapshot {
  offerCode: string
  offerName: string
}

function getValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj)
}

function firstString(obj: any, paths: string[]): string | null {
  for (const path of paths) {
    const value = getValue(obj, path)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function extractOfferFromSale(item: any): HotmartOfferSnapshot | null {
  const offerCode = firstString(item, [
    'purchase.offer.code',
    'purchase.offer.offer_code',
    'purchase.offerCode',
    'purchase.offer_code',
    'offer.code',
    'offer.offer_code',
    'offerCode',
    'offer_code'
  ])

  if (!offerCode) return null

  const offerName = firstString(item, [
    'purchase.offer.name',
    'purchase.offer.offer_name',
    'purchase.offerName',
    'purchase.offer_name',
    'offer.name',
    'offer.offer_name',
    'offerName',
    'offer_name'
  ])

  if (!offerName) {
    return { offerCode, offerName: '' }
  }

  return { offerCode, offerName }
}

function extractSalesItems(responseData: any): any[] {
  const candidates = [
    responseData?.items,
    responseData?.data,
    responseData?.sales,
    responseData?.transactions,
    responseData?.results
  ]

  const items = candidates.find(Array.isArray)
  return items || []
}

function extractNextPageToken(responseData: any): string | null {
  return responseData?.page_info?.next_page_token
    || responseData?.pageInfo?.nextPageToken
    || responseData?.pagination?.next_page_token
    || responseData?.pagination?.nextPageToken
    || responseData?.next_page_token
    || null
}

function buildCheckoutLink(offerCode: string): string {
  return `${CHECKOUT_BASE_URL}?off=${encodeURIComponent(offerCode)}&checkoutMode=10`
}

async function fetchHotmartOffers(accessToken: string): Promise<HotmartOfferSnapshot[]> {
  const offers = new Map<string, HotmartOfferSnapshot>()
  let pageToken: string | null = null
  let page = 0

  do {
    page += 1
    const response = await axios.get(HOTMART_SALES_HISTORY_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      params: {
        max_results: 100,
        ...(pageToken ? { page_token: pageToken } : {})
      },
      timeout: 30000
    })

    for (const item of extractSalesItems(response.data)) {
      const offer = extractOfferFromSale(item)
      if (!offer) continue

      const previous = offers.get(offer.offerCode)
      if (!previous || (!previous.offerName && offer.offerName)) {
        offers.set(offer.offerCode, offer)
      }
    }

    pageToken = extractNextPageToken(response.data)
  } while (pageToken)

  return [...offers.values()]
}

export async function syncRenewalOffers(): Promise<RenewalSyncReport> {
  const accessToken = await getHotmartAccessToken()
  const now = new Date()
  const seenOffers = await fetchHotmartOffers(accessToken)
  const unknownNames = new Set<string>()
  let upserted = 0

  for (const offer of seenOffers) {
    let offerName = offer.offerName

    if (!offerName) {
      const existing = await RenewalOffer.findOne({ offerCode: offer.offerCode })
        .select('offerName')
        .lean()
        .exec()

      offerName = existing?.offerName || ''
    }

    if (!offerName) {
      unknownNames.add(offer.offerCode)
      continue
    }

    const parsed = parseOfferName(offerName)
    if (!parsed.valid) unknownNames.add(offerName)

    await RenewalOffer.updateOne(
      { offerCode: offer.offerCode },
      {
        $set: {
          offerCode: offer.offerCode,
          offerName,
          link: buildCheckoutLink(offer.offerCode),
          turmaNumbers: parsed.valid ? parsed.turmaNumbers : [],
          periodYYMM: parsed.periodYYMM,
          periodStart: parsed.periodStart,
          isRenewal: parsed.isRenewal,
          isActive: true,
          lastSeenAt: now
        }
      },
      { upsert: true }
    )

    upserted += 1
  }

  const cutoff = new Date(now.getTime() - DEACTIVATE_AFTER_DAYS * 24 * 60 * 60 * 1000)
  const deactivateResult = await RenewalOffer.updateMany(
    {
      isActive: true,
      lastSeenAt: { $lt: cutoff },
      periodStart: { $lte: now }
    },
    { $set: { isActive: false } }
  )

  return {
    upserted,
    deactivated: deactivateResult.modifiedCount || 0,
    unknownNames: [...unknownNames].sort()
  }
}

export default syncRenewalOffers
