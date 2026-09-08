// Reembolsos Hotmart -> remoção da tag de turma na AC.
// O serviço nasce em dry-run e só toca na BD/AC com `dryRun: false` explícito.

import type { FilterQuery } from 'mongoose'
import HotmartSaleHistory, { type IHotmartSale, type IHotmartSaleHistory } from '../../models/HotmartSaleHistory'
import UserProduct from '../../models/UserProduct'
import ACStudentTag, { type IACTag } from '../../models/ACStudentTag'
import StudentRenewalTimeline, { type IStudentRenewalTimeline } from '../../models/StudentRenewalTimeline'
import AcWriteLog from '../../models/renewal/AcWriteLog'
import { MAX_PROVIDER_READ_ITEMS } from '../../security/providerReadBatchPolicy'
import activeCampaignService from '../activeCampaign/activeCampaignService'
import {
  assertMainParityOwnership,
  mainParityLocalMutationStarted,
  mainParityProviderStarted,
  mainParityProviderSucceeded,
} from './mainParityExecution'

const REFUND_STATUSES = new Set(['REFUNDED', 'CHARGEBACK'])
const READ_BATCH_SIZE = 200
export const MAX_REFUND_SCAN_ITEMS = MAX_PROVIDER_READ_ITEMS

type SaleRecord = Pick<IHotmartSale, 'transaction' | 'transactionStatus' | 'approvedDate' | 'orderDate'>
type HistoryDoc = Pick<IHotmartSaleHistory, 'userId' | 'productId' | 'email'> & { sales?: SaleRecord[] }
type Cycle = IStudentRenewalTimeline['ciclos'][number]
type TimelineDoc = Pick<IStudentRenewalTimeline, 'userId'> & { ciclos?: Cycle[] }
type TagDoc = { email: string; tags?: IACTag[] }
type UserProductDoc = { _id: unknown; metadata?: { refunded?: boolean } }
type RefundPlan = {
  history: HistoryDoc
  email: string
  refund: SaleRecord
  refundDate: Date
  turmaTags: RefundCandidate['turmaTags']
}

export interface RefundCandidate {
  refundDate: Date
  validSalesAfter: number
  turmaTags: Array<{ id: string; nome: string; aplicadaEm: Date | null }>
}

export function deveTratarReembolso(candidate: RefundCandidate):
  { tratar: true; motivo: 'semCompraPosterior' | 'semTag' } | { tratar: false; motivo: 'temCompraPosterior' } {
  if (candidate.validSalesAfter > 0) return { tratar: false, motivo: 'temCompraPosterior' }
  if (candidate.turmaTags.length === 0) return { tratar: true, motivo: 'semTag' }
  return { tratar: true, motivo: 'semCompraPosterior' }
}

export interface RefundHandlerOptions { dryRun?: boolean; emails?: string[] }
export interface RefundHandlerReport {
  dryRun: boolean
  reembolsos: number
  protegidosPorRecompra: number
  aMarcarBd: number
  marcadosBd: number
  aRemover: number
  removidas: number
  semTag: number
  semUserProduct: number
  erros: Array<{ email: string; error: string }>
}

export class RefundHandlerPartialFailure extends Error {
  constructor(readonly report: RefundHandlerReport) {
    super('REFUND_HANDLER_PARTIAL_FAILURE')
    this.name = 'RefundHandlerPartialFailure'
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'erro'
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === 11000
}

function dataDaVenda(venda: Pick<SaleRecord, 'approvedDate' | 'orderDate'>): Date | null {
  const data = venda.approvedDate ?? venda.orderDate
  if (!data) return null
  const parsed = data instanceof Date ? data : new Date(data)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function idempotencyKey(email: string, transaction: string | null, tagId: string): string {
  return `reembolso:${email}:${transaction ?? 'sem-transacao'}:${tagId}:false`
}

async function logRemocao(email: string, tag: { id: string; nome: string }, refund: SaleRecord): Promise<void> {
  mainParityLocalMutationStarted()
  try {
    await AcWriteLog.create({
      quando: new Date(), servico: 'reembolso', email,
      campo: Number(tag.id) || 0, antes: tag.nome, depois: null,
      accao: 'escrito', motivo: 'reembolsado', dryRun: false,
      idempotencyKey: idempotencyKey(email, refund.transaction, tag.id),
      tagId: tag.id, tagNome: tag.nome,
    })
  } catch (error: unknown) {
    if (isDuplicateKey(error)) return
    throw error
  }
}

function temRecompraNoMesmoPeriodo(timeline: TimelineDoc | undefined, ciclo: Cycle | undefined, refundDate: Date): boolean {
  if (!ciclo) return false
  const comprasValidas = (timeline?.ciclos ?? []).flatMap((item) => item.compras.flatMap((compra) => {
    if (compra.reembolsada === true) return []
    const data = dataDaVenda({ approvedDate: compra.data, orderDate: compra.data })
    return data ? [{ periodo: item.periodo, data }] : []
  }))
  if (!comprasValidas.some((compra) =>
    compra.periodo === ciclo.periodo && compra.data.getTime() >= refundDate.getTime())) return false
  const compraMaisRecente = comprasValidas.reduce<(typeof comprasValidas)[number] | null>(
    (latest, compra) => !latest || compra.data.getTime() > latest.data.getTime() ? compra : latest,
    null,
  )
  return compraMaisRecente?.periodo === ciclo.periodo
}

async function readHistories(filtro: FilterQuery<IHotmartSaleHistory>): Promise<HistoryDoc[]> {
  const cursor = HotmartSaleHistory.find(filtro)
    .select('userId productId email sales').sort({ _id: 1 }).maxTimeMS(5_000).lean()
    .cursor({ batchSize: READ_BATCH_SIZE })
  const histories: HistoryDoc[] = []
  let saleCount = 0
  for await (const raw of cursor) {
    const history = raw as unknown as HistoryDoc
    histories.push(history)
    saleCount += history.sales?.length ?? 0
    if (histories.length > MAX_REFUND_SCAN_ITEMS || saleCount > MAX_REFUND_SCAN_ITEMS) {
      await cursor.close()
      throw new Error('REFUND_HANDLER_SCAN_CAP_EXCEEDED')
    }
  }
  return histories
}

async function readContext(histories: HistoryDoc[]): Promise<{
  timelinePorUser: Map<string, TimelineDoc>
  tagsPorEmail: Map<string, TagDoc>
}> {
  const timelinePorUser = new Map<string, TimelineDoc>()
  const tagsPorEmail = new Map<string, TagDoc>()
  for (let offset = 0; offset < histories.length; offset += READ_BATCH_SIZE) {
    const batch = histories.slice(offset, offset + READ_BATCH_SIZE)
    const userIds = [...new Set(batch.map((history) => history.userId))]
    const emails = [...new Set(batch.map((history) => history.email.toLowerCase().trim()))]
    const [timelines, tags] = await Promise.all([
      StudentRenewalTimeline.find({ userId: { $in: userIds } })
        .select('userId ciclos').lean().exec() as unknown as Promise<TimelineDoc[]>,
      ACStudentTag.find({ email: { $in: emails } })
        .select('email tags').lean().exec() as unknown as Promise<TagDoc[]>,
    ])
    for (const timeline of timelines) timelinePorUser.set(String(timeline.userId), timeline)
    for (const tag of tags) tagsPorEmail.set(tag.email.toLowerCase().trim(), tag)
  }
  return { timelinePorUser, tagsPorEmail }
}

function buildRefundPlans(
  histories: HistoryDoc[],
  timelinePorUser: Map<string, TimelineDoc>,
  tagsPorEmail: Map<string, TagDoc>,
  report: RefundHandlerReport,
): RefundPlan[] {
  const plans: RefundPlan[] = []
  for (const history of histories) {
    const email = history.email.toLowerCase().trim()
    for (const refund of (history.sales ?? []).filter((sale) =>
      REFUND_STATUSES.has(String(sale.transactionStatus ?? '').toUpperCase()))) {
      const refundDate = dataDaVenda(refund)
      if (!refundDate) continue
      report.reembolsos += 1
      const timeline = timelinePorUser.get(String(history.userId))
      const ciclo = timeline?.ciclos?.find((item) =>
        item.compras.some((compra) => Boolean(compra.transacao) && compra.transacao === refund.transaction))
      const validSalesAfter = temRecompraNoMesmoPeriodo(timeline, ciclo, refundDate) ? 1 : 0
      const nomesDoCiclo = new Set<string>([
        ...(ciclo?.coortes ?? []).flatMap((coorte) => coorte.tag?.nome ? [coorte.tag.nome] : []),
        ...(ciclo?.tagEsperada ? [ciclo.tagEsperada] : []),
      ])
      const turmaTags = (tagsPorEmail.get(email)?.tags ?? [])
        .filter((tag) => nomesDoCiclo.has(tag.nome))
        .map((tag) => ({ id: tag.tagId, nome: tag.nome, aplicadaEm: tag.aplicadaEm }))
      const decisao = deveTratarReembolso({ refundDate, validSalesAfter, turmaTags })
      if (!decisao.tratar && turmaTags.length > 0) {
        report.protegidosPorRecompra += 1
        continue
      }
      report.aRemover += turmaTags.length
      if (report.aRemover > MAX_REFUND_SCAN_ITEMS) throw new Error('REFUND_HANDLER_EFFECT_CAP_EXCEEDED')
      if (turmaTags.length === 0) report.semTag += 1
      plans.push({ history, email, refund, refundDate, turmaTags })
    }
  }
  return plans
}

/** Processa os eventos que já estão no espelho; não consulta a Hotmart. */
export async function handleRefunds(opcoes: RefundHandlerOptions = {}): Promise<RefundHandlerReport> {
  const dryRun = opcoes.dryRun !== false
  const emails = opcoes.emails?.map((email) => email.toLowerCase().trim())
  const filtro: FilterQuery<IHotmartSaleHistory> = emails?.length ? { email: { $in: emails } } : {}
  const report: RefundHandlerReport = {
    dryRun, reembolsos: 0, protegidosPorRecompra: 0,
    aMarcarBd: 0, marcadosBd: 0, aRemover: 0, removidas: 0,
    semTag: 0, semUserProduct: 0, erros: [],
  }
  const histories = await readHistories(filtro)
  const { timelinePorUser, tagsPorEmail } = await readContext(histories)
  const plans = buildRefundPlans(histories, timelinePorUser, tagsPorEmail, report)
  for (const { history, email, refund, refundDate, turmaTags } of plans) {
      const userProduct = await UserProduct.findOne({
        userId: history.userId,
        ...(history.productId ? { productId: history.productId } : {}),
        platform: 'hotmart',
      }).select('_id metadata').lean().exec() as unknown as UserProductDoc | null
      if (!userProduct) report.semUserProduct += 1
      else {
        report.aMarcarBd += 1
        if (!dryRun) {
          mainParityLocalMutationStarted()
          await UserProduct.updateOne(
            { _id: userProduct._id },
            { $set: { 'metadata.refunded': true, 'metadata.refundedAt': refundDate } },
          )
          report.marcadosBd += 1
        }
      }

      if (turmaTags.length === 0) continue
      for (const tag of turmaTags) {
        if (dryRun) continue
        try {
          mainParityProviderStarted()
          assertMainParityOwnership()
          const removed = await activeCampaignService.removeTagStrict(email, tag.nome)
          if (!removed) throw new Error('AC_TAG_REMOVE_NOT_CONFIRMED')
          mainParityProviderSucceeded()
          await logRemocao(email, tag, refund)
          report.removidas += 1
        } catch (error: unknown) {
          report.erros.push({ email, error: errorMessage(error) })
        }
      }
  }
  assertMainParityOwnership()
  if (report.erros.length > 0) throw new RefundHandlerPartialFailure(report)
  return report
}

export default handleRefunds
