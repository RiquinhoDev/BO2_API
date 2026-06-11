import axios from 'axios'
import Product from '../../models/product/Product'
import RenewalOffer from '../../models/RenewalOffer'
import User from '../../models/user'
import { getHotmartAccessToken } from '../syncUtilizadoresServices/hotmartServices/hotmart.helpers'
import { parseOfferName, parseTurmaName } from './turmaParser'

const HOTMART_SALES_HISTORY_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'
const CHECKOUT_BASE_URL = 'https://pay.hotmart.com/D61245882D'
const DEACTIVATE_AFTER_DAYS = 35

export interface RenewalSyncReport {
  upserted: number
  deactivated: number
  unknownNames: string[]
}

interface SuggestedTurma {
  turmaNumber: number
  count: number
}

interface HotmartOfferSnapshot {
  offerCode: string
  offerName: string
  paymentModes: Set<string>
  priceValue: number | null
  currency: string | null
  salesCount: number
  buyerEmails: Set<string>
}

type MongooseReadModel = {
  findOne: (...args: any[]) => any
  find?: (...args: any[]) => any
}

const ProductReadModel = Product as unknown as MongooseReadModel
const UserReadModel = User as unknown as MongooseReadModel

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

function firstScalarString(obj: any, paths: string[]): string | null {
  for (const path of paths) {
    const value = getValue(obj, path)
    if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) {
      return String(value).trim()
    }
  }
  return null
}

function extractOfferFromSale(item: any): { offerCode: string; offerName: string } | null {
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

function extractProductIdFromSale(item: any): string | null {
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

function isOgiSale(item: any, ogiHotmartProductId: string): boolean {
  const productId = extractProductIdFromSale(item)
  return Boolean(productId && productId === ogiHotmartProductId)
}

function extractPaymentMode(item: any): string | null {
  return firstString(item, ['purchase.offer.payment_mode', 'offer.payment_mode', 'purchase.payment.type'])
}

function extractPrice(item: any): { value: number | null; currency: string | null } {
  const value = getValue(item, 'purchase.price.value') ?? getValue(item, 'price.value')
  const currency = firstString(item, ['purchase.price.currency_code', 'price.currency_code'])
  return {
    value: typeof value === 'number' ? value : null,
    currency: currency || null
  }
}

function extractBuyerEmail(item: any): string | null {
  const email = firstString(item, ['buyer.email', 'purchase.buyer.email'])
  return email ? email.toLowerCase() : null
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

async function resolveOgiHotmartProductId(): Promise<string> {
  const envProductId = process.env.HOTMART_OGI_PRODUCT_ID?.trim()
  if (envProductId) return envProductId

  const ogiProduct = await ProductReadModel.findOne({
    platform: 'hotmart',
    isActive: true,
    $or: [
      { code: /^OGI/i },
      { courseCode: /^OGI/i },
      { name: /Grande Investimento/i }
    ]
  })
    .select('hotmartProductId')
    .lean()
    .exec() as { hotmartProductId?: string } | null

  if (!ogiProduct?.hotmartProductId) {
    throw new Error('HOTMART_OGI_PRODUCT_ID não configurado e produto OGI sem hotmartProductId na BD')
  }

  return ogiProduct.hotmartProductId
}

async function fetchHotmartOffers(
  accessToken: string,
  ogiHotmartProductId: string
): Promise<HotmartOfferSnapshot[]> {
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
      if (!isOgiSale(item, ogiHotmartProductId)) continue

      const offer = extractOfferFromSale(item)
      if (!offer) continue

      let snapshot = offers.get(offer.offerCode)
      if (!snapshot) {
        snapshot = {
          offerCode: offer.offerCode,
          offerName: offer.offerName,
          paymentModes: new Set<string>(),
          priceValue: null,
          currency: null,
          salesCount: 0,
          buyerEmails: new Set<string>()
        }
        offers.set(offer.offerCode, snapshot)
      }

      if (!snapshot.offerName && offer.offerName) snapshot.offerName = offer.offerName
      snapshot.salesCount += 1

      const paymentMode = extractPaymentMode(item)
      if (paymentMode) snapshot.paymentModes.add(paymentMode)

      const price = extractPrice(item)
      // guarda o preço mais alto observado (o preço-cheio da oferta)
      if (price.value !== null && (snapshot.priceValue === null || price.value > snapshot.priceValue)) {
        snapshot.priceValue = price.value
        snapshot.currency = price.currency
      }

      const email = extractBuyerEmail(item)
      if (email) snapshot.buyerEmails.add(email)
    }

    pageToken = extractNextPageToken(response.data)
  } while (pageToken)

  return [...offers.values()]
}

/**
 * Calcula a turma sugerida a partir das turmas actuais dos compradores da oferta.
 * Sinal real (sem seed): a turma dominante entre quem comprou ≈ turma da oferta.
 */
async function computeSuggestedTurmas(buyerEmails: Set<string>): Promise<SuggestedTurma[]> {
  if (buyerEmails.size === 0) return []

  const users = await UserReadModel.find!({ email: { $in: [...buyerEmails] } })
    .select('hotmart.enrolledClasses')
    .lean()
    .exec() as Array<{ hotmart?: { enrolledClasses?: Array<{ className?: string; isActive?: boolean }> } }>

  const tally = new Map<number, number>()
  for (const u of users) {
    const classes = u.hotmart?.enrolledClasses || []
    const className = classes.find((c) => c.className && c.isActive !== false)?.className
      || classes.find((c) => c.className)?.className
    const turmaNumber = className ? parseTurmaName(className).turmaNumber : null
    if (turmaNumber !== null) tally.set(turmaNumber, (tally.get(turmaNumber) || 0) + 1)
  }

  return [...tally.entries()]
    .map(([turmaNumber, count]) => ({ turmaNumber, count }))
    .sort((a, b) => b.count - a.count)
}

export async function syncRenewalOffers(): Promise<RenewalSyncReport> {
  const accessToken = await getHotmartAccessToken()
  const ogiHotmartProductId = await resolveOgiHotmartProductId()
  const now = new Date()
  const seenOffers = await fetchHotmartOffers(accessToken, ogiHotmartProductId)
  const unknownNames = new Set<string>()
  let upserted = 0

  for (const offer of seenOffers) {
    const existing = await RenewalOffer.findOne({ offerCode: offer.offerCode })
      .select('offerName isManuallyEdited')
      .lean()
      .exec()

    // A API de vendas Hotmart só devolve o offer code, não o nome.
    // Registamos o código na mesma (offerName='') para aparecer no Backoffice,
    // onde o staff lhe dá nome/turma/link à mão. Não saltamos códigos sem nome.
    const offerName = offer.offerName || existing?.offerName || ''
    const parsed = parseOfferName(offerName)

    // Código por nomear/mapear → entra no relatório para revisão no BO.
    if (!offerName || !parsed.valid) unknownNames.add(offer.offerCode)

    const suggestedTurmas = await computeSuggestedTurmas(offer.buyerEmails)

    const update: any = {
      $set: {
        lastSeenAt: now,
        isActive: true,
        // observacional (info p/ o BO) — actualiza sempre, mesmo em ofertas editadas
        priceValue: offer.priceValue,
        currency: offer.currency,
        paymentModes: [...offer.paymentModes],
        salesCount: offer.salesCount,
        suggestedTurmas
      },
      $setOnInsert: {
        offerCode: offer.offerCode,
        offerName,
        link: buildCheckoutLink(offer.offerCode),
        turmaNumbers: parsed.valid ? parsed.turmaNumbers : [],
        periodYYMM: parsed.periodYYMM,
        periodStart: parsed.periodStart,
        isRenewal: parsed.isRenewal,
        source: 'hotmart_sync',
        isManuallyEdited: false
      }
    }

    // se já existe sem nome e agora temos um, preenche (sem tocar nos derivados)
    if (existing && !existing.offerName && offerName) {
      update.$set.offerName = offerName
    }

    await RenewalOffer.updateOne(
      { offerCode: offer.offerCode },
      update,
      { upsert: true }
    )

    upserted += 1
  }

  const cutoff = new Date(now.getTime() - DEACTIVATE_AFTER_DAYS * 24 * 60 * 60 * 1000)
  const deactivateResult = await RenewalOffer.updateMany(
    {
      isActive: true,
      source: { $ne: 'manual' },
      isManuallyEdited: { $ne: true },
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
