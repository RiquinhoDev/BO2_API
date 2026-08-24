// Reembolsos Hotmart → remoção da tag de turma na AC.
// A detecção e a marcação da nossa BD são separadas da escrita externa. O
// serviço nasce em dry-run e só toca na AC com `dryRun: false` explícito.

import HotmartSaleHistory from '../../models/HotmartSaleHistory'
import UserProduct from '../../models/UserProduct'
import ACStudentTag from '../../models/ACStudentTag'
import StudentRenewalTimeline from '../../models/StudentRenewalTimeline'
import AcWriteLog from '../../models/renewal/AcWriteLog'
import activeCampaignService from '../activeCampaign/activeCampaignService'

const REFUND_STATUSES = new Set(['REFUNDED', 'CHARGEBACK'])

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

export interface RefundHandlerOptions {
  dryRun?: boolean
  emails?: string[]
}

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

function dataDaVenda(venda: any): Date | null {
  const data = venda?.approvedDate ?? venda?.orderDate
  if (!data) return null
  const parsed = data instanceof Date ? data : new Date(data)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function idempotencyKey(email: string, transaction: string | null, tagId: string, dryRun: boolean): string {
  return `reembolso:${email}:${transaction ?? 'sem-transacao'}:${tagId}:${dryRun}`
}

async function logRemocao(
  email: string,
  tag: { id: string; nome: string },
  refund: any,
  dryRun: boolean
): Promise<void> {
  try {
    await (AcWriteLog as any).create({
      quando: new Date(),
      servico: 'reembolso',
      email,
      campo: Number(tag.id) || 0,
      antes: tag.nome,
      depois: null,
      accao: 'escrito',
      motivo: 'reembolsado',
      dryRun,
      idempotencyKey: idempotencyKey(email, refund.transaction ?? null, tag.id, dryRun),
      tagId: tag.id,
      tagNome: tag.nome
    })
  } catch (error: any) {
    if (error?.code === 11000) return
    throw error
  }
}

type HistoryDoc = { userId: any; productId?: any; email: string; sales?: any[] }
type TimelineDoc = { userId: any; ciclos?: any[] }

/** Processa os eventos que já estão no espelho; não consulta a Hotmart. */
export async function handleRefunds(opcoes: RefundHandlerOptions = {}): Promise<RefundHandlerReport> {
  const dryRun = opcoes.dryRun !== false
  const filtro = opcoes.emails?.length
    ? { email: { $in: opcoes.emails.map((email) => email.toLowerCase().trim()) } }
    : {}
  const report: RefundHandlerReport = {
    dryRun,
    reembolsos: 0,
    protegidosPorRecompra: 0,
    aMarcarBd: 0,
    marcadosBd: 0,
    aRemover: 0,
    removidas: 0,
    semTag: 0,
    semUserProduct: 0,
    erros: []
  }

  const [historias, timelines, tags] = await Promise.all([
    (HotmartSaleHistory as any).find(filtro).lean().exec() as Promise<HistoryDoc[]>,
    (StudentRenewalTimeline as any).find({}).select('userId ciclos').lean().exec() as Promise<TimelineDoc[]>,
    (ACStudentTag as any).find(filtro).select('email tags').lean().exec() as Promise<Array<{ email: string; tags?: any[] }>>
  ])
  const timelinePorUser = new Map(timelines.map((timeline) => [String(timeline.userId), timeline]))
  const tagsPorEmail = new Map(tags.map((doc) => [String(doc.email).toLowerCase().trim(), doc]))

  for (const historia of historias) {
    const email = String(historia.email).toLowerCase().trim()
    const vendas = historia.sales ?? []
    for (const refund of vendas.filter((venda) => REFUND_STATUSES.has(String(venda.transactionStatus ?? '').toUpperCase()))) {
      const refundDate = dataDaVenda(refund)
      if (!refundDate) continue
      report.reembolsos += 1
      const timeline = timelinePorUser.get(String(historia.userId))
      const ciclo = (timeline?.ciclos ?? []).find((item: any) =>
        (item.compras ?? []).some((compra: any) => compra.transacao && compra.transacao === refund.transaction)
      )
      // A recompra que protege o aluno tem de pertencer ao mesmo ciclo do
      // reembolso. Uma compra anual posterior de outro ciclo não torna a
      // tag da turma reembolsada legítima.
      const validSalesAfter = (ciclo?.compras ?? []).filter((compra: any) => {
        if (compra.reembolsada === true) return false
        const data = dataDaVenda({ approvedDate: compra.data, orderDate: compra.data })
        return data && data.getTime() > refundDate.getTime()
      }).length
      const nomesDaCiclo = new Set<string>([
        ...(ciclo?.coortes ?? []).map((coorte: any) => coorte.tag?.nome).filter(Boolean),
        ciclo?.tagEsperada
      ])
      const tagsDoAluno = (tagsPorEmail.get(email)?.tags ?? [])
      const turmaTags = tagsDoAluno
        .filter((tag: any) => nomesDaCiclo.has(tag.nome))
        .map((tag: any) => ({ id: String(tag.tagId), nome: String(tag.nome), aplicadaEm: tag.aplicadaEm ?? null }))
      const decisao = deveTratarReembolso({ refundDate, validSalesAfter, turmaTags })
      if (!decisao.tratar) {
        report.protegidosPorRecompra += 1
        continue
      }

      const userProduct = await (UserProduct as any).findOne({
        userId: historia.userId,
        ...(historia.productId ? { productId: historia.productId } : {}),
        platform: 'hotmart'
      })
        .select('_id metadata')
        .lean()
        .exec() as { _id: any; metadata?: { refunded?: boolean } } | null
      if (!userProduct) {
        report.semUserProduct += 1
      } else {
        report.aMarcarBd += 1
        if (!dryRun) {
          await (UserProduct as any).updateOne(
            { _id: userProduct._id },
            { $set: { 'metadata.refunded': true, 'metadata.refundedAt': refundDate } }
          )
          report.marcadosBd += 1
        }
      }

      if (turmaTags.length === 0) {
        report.semTag += 1
        continue
      }
      for (const tag of turmaTags) {
        report.aRemover += 1
        try {
          await logRemocao(email, tag, refund, dryRun)
          if (!dryRun) {
            await activeCampaignService.removeTag(email, tag.nome)
            report.removidas += 1
          }
        } catch (error: any) {
          report.erros.push({ email, error: error?.message ?? 'erro' })
        }
      }
    }
  }
  return report
}

export default handleRefunds
