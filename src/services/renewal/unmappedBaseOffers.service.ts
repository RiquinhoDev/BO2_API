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

type MongooseReadModel = {
  find: (...args: any[]) => any
  findOne: (...args: any[]) => any
}

const RenewalOfferReadModel = RenewalOffer as unknown as MongooseReadModel
const ProductReadModel = Product as unknown as MongooseReadModel
const UserProductReadModel = UserProduct as unknown as MongooseReadModel
const HotmartSaleHistoryReadModel = HotmartSaleHistory as unknown as MongooseReadModel

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
  const ogiProduct = await ProductReadModel.findOne({
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
    RenewalOfferReadModel.find({})
      .select('offerCode offerName periodYYMM isRenewal priceValue currency lastSeenAt')
      .lean()
      .exec() as Promise<OfertaBase[]>,
  ])

  if (!ogiProductId) return []

  const candidates = new Map(
    offers
      .filter((offer) => !isRenewalOffer(offer) && !hasValidTurma(offer))
      .map((offer) => [offer.offerCode, offer]),
  )
  if (candidates.size === 0) return []

  const activeEnrollments = await UserProductReadModel.find({
    platform: 'hotmart',
    productId: ogiProductId,
    status: 'ACTIVE',
  })
    .select('userId')
    .lean()
    .exec() as Array<{ userId: unknown }>
  const activeUserIds = activeEnrollments.map((enrollment) => enrollment.userId)
  if (activeUserIds.length === 0) return []

  const histories = await HotmartSaleHistoryReadModel.find({
    userId: { $in: activeUserIds },
  })
    .select('userId sales')
    .lean()
    .exec() as Array<{ userId: unknown; sales?: VendaHistorico[] }>

  const counters = new Map<string, { students: Set<string>; salesCount: number }>()
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
