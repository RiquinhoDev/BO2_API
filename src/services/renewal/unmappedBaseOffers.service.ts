import HotmartSaleHistory from '../../models/HotmartSaleHistory'
import Product from '../../models/product/Product'
import RenewalOffer from '../../models/RenewalOffer'
import UserProduct from '../../models/UserProduct'
import { TURMA_1_RENEWAL_OFFER_CODE, TURMA_2_RENEWAL_OFFER_CODE } from './renewalConstants'
import { isValidSale } from './renewalCycles'
import { parseOfferName, tipoDeTurma } from './turmaParser'

const CODIGOS_RENOVACAO_ESPECIAIS = new Set([
  TURMA_1_RENEWAL_OFFER_CODE,
  TURMA_2_RENEWAL_OFFER_CODE,
])

const READ_BATCH_SIZE = 200

async function collectCursor<T>(cursor: AsyncIterable<unknown>): Promise<T[]> {
  const result: T[] = []
  for await (const entry of cursor) result.push(entry as T)
  return result
}

interface OfertaBase {
  offerCode: string
  offerName: string
  periodYYMM: string | null
  isRenewal: boolean
  priceValue: number | null
  currency: string | null
  lastSeenAt: Date
}

interface VendaHistorico {
  offerCode: string | null
  transactionStatus: string | null
  approvedDate: Date | null
  orderDate: Date | null
}

export interface OfertaBaseSemTurma {
  offerCode: string
  offerName: string
  periodYYMM: string | null
  alunosAfetados: number
  salesCount: number
  priceValue: number | null
  currency: string | null
  lastSeenAt: Date
}

function isRenewalOffer(offer: OfertaBase): boolean {
  return CODIGOS_RENOVACAO_ESPECIAIS.has(offer.offerCode)
    || offer.isRenewal
    || tipoDeTurma(offer.offerName) === 'renovacao'
}

function hasValidTurma(offer: OfertaBase): boolean {
  const nameWithStoredPeriod = offer.periodYYMM
    ? `${offer.offerName} | ${offer.periodYYMM}`
    : offer.offerName
  return parseOfferName(nameWithStoredPeriod).valid
}

async function resolveOgiProductId(): Promise<unknown | null> {
  const ogiProduct = await Product.findOne({
    platform: 'hotmart',
    isActive: true,
    $or: [
      { code: /^OGI/i },
      { courseCode: /^OGI/i },
      { name: /Grande Investimento/i },
    ],
  })
    .select('_id')
    .lean()
    .exec() as { _id?: unknown } | null

  return ogiProduct?._id ?? null
}

/**
 * Read-model de ofertas base vendidas a alunos OGI Hotmart activos que ainda
 * não permitem ao escritor calcular a expiração. Não infere turma nem escreve.
 */
export async function getUnmappedBaseOffers(): Promise<OfertaBaseSemTurma[]> {
  const [ogiProductId, offers] = await Promise.all([
    resolveOgiProductId(),
    collectCursor<OfertaBase>(RenewalOffer.find({})
      .select('offerCode offerName periodYYMM isRenewal priceValue currency lastSeenAt')
      .sort({ _id: 1 })
      .maxTimeMS(5_000)
      .lean()
      .cursor({ batchSize: READ_BATCH_SIZE })),
  ])

  if (!ogiProductId) return []

  const candidates = new Map(
    offers
      .filter((offer) => !isRenewalOffer(offer) && !hasValidTurma(offer))
      .map((offer) => [offer.offerCode, offer]),
  )
  if (candidates.size === 0) return []

  const activeEnrollmentCursor = UserProduct.find({
    platform: 'hotmart',
    productId: ogiProductId,
    status: 'ACTIVE',
  })
    .select('userId')
    .sort({ _id: 1 })
    .maxTimeMS(5_000)
    .lean()
    .cursor({ batchSize: READ_BATCH_SIZE })
  const counters = new Map<string, { students: Set<string>; salesCount: number }>()
  let activeUserIds: unknown[] = []
  const countHistoryBatch = async (): Promise<void> => {
    if (activeUserIds.length === 0) return
    const histories = await collectCursor<{ userId: unknown; sales?: VendaHistorico[] }>(
      HotmartSaleHistory.find({ userId: { $in: activeUserIds } })
        .select('userId sales')
        .sort({ _id: 1 })
        .maxTimeMS(5_000)
        .lean()
        .cursor({ batchSize: READ_BATCH_SIZE }),
    )
    for (const history of histories) {
      for (const sale of history.sales ?? []) {
        const offerCode = sale.offerCode?.trim()
        if (!offerCode || !candidates.has(offerCode) || !isValidSale(sale)) continue

        const current = counters.get(offerCode) ?? { students: new Set<string>(), salesCount: 0 }
        current.students.add(String(history.userId))
        current.salesCount += 1
        counters.set(offerCode, current)
      }
    }
    activeUserIds = []
  }
  for await (const enrollment of activeEnrollmentCursor) {
    activeUserIds.push(enrollment.userId)
    if (activeUserIds.length === READ_BATCH_SIZE) await countHistoryBatch()
  }
  await countHistoryBatch()

  return [...counters.entries()]
    .map(([offerCode, counter]) => {
      const offer = candidates.get(offerCode)!
      return {
        offerCode,
        offerName: offer.offerName,
        periodYYMM: offer.periodYYMM,
        alunosAfetados: counter.students.size,
        salesCount: counter.salesCount,
        priceValue: offer.priceValue,
        currency: offer.currency,
        lastSeenAt: offer.lastSeenAt,
      }
    })
    .sort((a, b) => b.alunosAfetados - a.alunosAfetados || a.offerCode.localeCompare(b.offerCode))
}

export default getUnmappedBaseOffers
