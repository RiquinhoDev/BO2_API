import type mongoose from 'mongoose'
import ACRenewalData from '../../models/ACRenewalData'
import AcExpirationEventState from '../../models/AcExpirationEventState'
import HotmartSaleHistory from '../../models/HotmartSaleHistory'
import RenewalOffer from '../../models/RenewalOffer'
import User from '../../models/user'
import { agruparCiclos } from './renewalCycles'
import { nomeDaTurmaActual, type OfertaDaAncora } from './acExpirationPolicy'
import type { EstadoEvento, SeletorManual } from './acExpiration.types'
import type { VendaEntrada } from './renewalTimeline.types'

const READ_BATCH_SIZE = 200

interface AcEntry {
  userId: mongoose.Types.ObjectId
  email: string
  contactId: string | null
  expirationDate: Date | null
  refundDate: Date | null
  purchaseStatus: string | null
  lastSyncedAt: Date
  syncError: string | null
}

interface HotmartEntry {
  userId: mongoose.Types.ObjectId
  sales: VendaEntrada[] | null
  latestApprovedDate: Date | null
  latestTransactionStatus: string | null
}

interface UserEntry {
  _id: mongoose.Types.ObjectId
  hotmart?: { enrolledClasses?: Array<{ className?: string; isActive?: boolean }> }
}

async function collectCursor<T>(cursor: AsyncIterable<unknown>): Promise<T[]> {
  const result: T[] = []
  for await (const entry of cursor) result.push(entry as T)
  return result
}

export async function loadAcExpirationContext(manual?: SeletorManual) {
  const filtroAc = manual
    ? {
        ...(manual.email ? { email: manual.email.trim().toLowerCase() } : {}),
        ...(manual.userId ? { userId: manual.userId } : {}),
      }
    : {}
  const acEntries = await collectCursor<AcEntry>(ACRenewalData.find(filtroAc)
    .select('userId email contactId expirationDate refundDate purchaseStatus lastSyncedAt syncError')
    .sort({ _id: 1 })
    .maxTimeMS(5_000)
    .lean()
    .cursor({ batchSize: READ_BATCH_SIZE }))

  const hotmartDocs: HotmartEntry[] = []
  const users: UserEntry[] = []
  const estados: EstadoEvento[] = []
  for (let offset = 0; offset < acEntries.length; offset += READ_BATCH_SIZE) {
    const userIds = acEntries.slice(offset, offset + READ_BATCH_SIZE).map(entry => entry.userId)
    const [hotmartBatch, userBatch, stateBatch] = await Promise.all([
      collectCursor<HotmartEntry>(HotmartSaleHistory.find({ userId: { $in: userIds } })
        .select('userId sales latestApprovedDate latestTransactionStatus').sort({ _id: 1 }).maxTimeMS(5_000)
        .lean().cursor({ batchSize: READ_BATCH_SIZE })),
      collectCursor<UserEntry>(User.find({ _id: { $in: userIds } })
        .select('_id hotmart.enrolledClasses').sort({ _id: 1 }).maxTimeMS(5_000)
        .lean().cursor({ batchSize: READ_BATCH_SIZE })),
      collectCursor<EstadoEvento>(AcExpirationEventState.find({ userId: { $in: userIds } })
        .select('userId status eventIdentity saleIdentity anchorDate cycleYears emptyExpirationSnapshotAt claimToken leaseUntil claimedAt pendingEventIdentity pendingSaleIdentity pendingAnchorDate pendingCycleYears pendingExpiration pendingEmptyExpirationSnapshotAt pendingReason')
        .sort({ _id: 1 }).maxTimeMS(5_000).lean().cursor({ batchSize: READ_BATCH_SIZE })),
    ])
    hotmartDocs.push(...hotmartBatch)
    users.push(...userBatch)
    estados.push(...stateBatch)
  }

  const hotmartByUserId = new Map(hotmartDocs.map(entry => [String(entry.userId), entry]))
  const turmaActualByUserId = new Map(users.map(user => [String(user._id), nomeDaTurmaActual(user)]))
  const estadoByUserId = new Map(estados.map(estado => [String(estado.userId), estado]))
  const cicloByUserId = new Map(hotmartDocs.map(entry => [
    String(entry.userId),
    agruparCiclos(entry.sales ?? []).filter(ciclo => ciclo.compras.some(compra => !compra.reembolsada)).at(-1) ?? null,
  ]))
  const codigosOferta = [...new Set(
    [...cicloByUserId.values()]
      .map(ciclo => ciclo?.compras[0]?.offerCode)
      .filter((codigo): codigo is string => typeof codigo === 'string' && codigo !== ''),
  )]
  const ofertas: OfertaDaAncora[] = []
  for (let offset = 0; offset < codigosOferta.length; offset += READ_BATCH_SIZE) {
    const offerCodes = codigosOferta.slice(offset, offset + READ_BATCH_SIZE)
    ofertas.push(...await collectCursor<OfertaDaAncora>(RenewalOffer.find({ offerCode: { $in: offerCodes } })
      .select('offerCode offerName periodYYMM isRenewal').sort({ _id: 1 }).maxTimeMS(5_000)
      .lean().cursor({ batchSize: READ_BATCH_SIZE })))
  }
  const ofertaByCode = new Map(ofertas.map(oferta => [oferta.offerCode, oferta]))

  return { acEntries, hotmartByUserId, turmaActualByUserId, estadoByUserId, cicloByUserId, ofertaByCode }
}
