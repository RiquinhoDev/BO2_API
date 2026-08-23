// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/acExpirationSync.service.ts
// Escreve a "Data de expiração" (AC field 332) — o ÚNICO campo que
// este sistema escreve na AC. As automações da AC correm no fim de
// cada mês, disparadas pelo valor que aqui deixamos, não por cada
// escrita nossa — por isso não há urgência de "só escrever se mudou"
// por causa de retrigger, mas fazemo-lo na mesma para poupar chamadas.
//
// Regra da expiração, escolhida pela oferta da compra âncora:
//   base       → período/nome da oferta (incluindo [2 anos]);
//   renovação  → compra âncora + 12 meses × anos do ciclo.
// Nos dois ramos, o resultado é o último instante UTC do mês.
//
// Um estado interno por aluno identifica o último ciclo tratado. O campo
// de compra da AC não é watermark: prestações podem mudá-lo sem criarem
// um ciclo, e atrasos de sincronização fariam perder eventos.
//
// NUNCA escreve para quem está reembolsado (nem data de compra, nem
// tags, nem mais nada — só a expiração, e só quando faz sentido).
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import ACRenewalData from '../../models/ACRenewalData'
import AcExpirationEventState from '../../models/AcExpirationEventState'
import HotmartSaleHistory from '../../models/HotmartSaleHistory'
import RenewalOffer from '../../models/RenewalOffer'
import { activeCampaignService } from '../activeCampaign/activeCampaignService'
import { AC_EXPIRATION_DATE_FIELD_ID } from './acRenewalDataSync.service'
import { TURMA_1_RENEWAL_OFFER_CODE, TURMA_2_RENEWAL_OFFER_CODE } from './renewalConstants'
import { agruparCiclos } from './renewalCycles'
import { parseOfferName, parseTurmaName, tipoDeTurma } from './turmaParser'
import type { CicloBase, VendaEntrada } from './renewalTimeline.types'

// mesmos 2 estados usados em hotmartRefunds.service.ts — uma compra
// nestes estados nunca deve gerar escrita de expiração.
const REFUND_TRANSACTION_STATUSES = new Set(['REFUNDED', 'CHARGEBACK'])
const CODIGOS_RENOVACAO_ESPECIAIS = new Set([TURMA_1_RENEWAL_OFFER_CODE, TURMA_2_RENEWAL_OFFER_CODE])

export interface AcExpirationSyncReport {
  candidatesChecked: number
  alreadyInSync: number
  needsWrite: number
  written: number
  wouldWrite: number
  skippedRefunded: number
  skippedNoContact: number
  skippedNoHotmartData: number
  semTurma: number
  skippedWouldShorten: number
  bootstrapped: number
  skippedNoNewEvent: number
  divergentes: Array<{ email: string; acTem: Date | null; calculado: Date; motivo: 'encurtaria' | 'diferente' }>
  errors: Array<{ email: string; error: string }>
}

type MongooseReadModel = { find: (...args: any[]) => any }
const ACRenewalDataReadModel = ACRenewalData as unknown as MongooseReadModel
const HotmartSaleHistoryReadModel = HotmartSaleHistory as unknown as MongooseReadModel
const RenewalOfferReadModel = RenewalOffer as unknown as MongooseReadModel
const AcExpirationEventStateReadModel = AcExpirationEventState as unknown as MongooseReadModel

interface OfertaDaAncora {
  offerCode: string
  offerName: string | null
  periodYYMM: string | null
  isRenewal: boolean
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

function formatDateYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Último instante UTC do mesmo mês, `anos` depois da compra.
 */
export function computeExpirationFromPurchaseDate(purchaseDate: Date, anos = 1): Date {
  return new Date(Date.UTC(purchaseDate.getUTCFullYear() + anos, purchaseDate.getUTCMonth() + 1, 0, 23, 59, 59, 999))
}

/** Compra âncora do ciclo de acesso mais recente; vendas inválidas não contam. */
export function dataBaseDoAluno(sales: VendaEntrada[]): Date | null {
  const ultimoCiclo = agruparCiclos(sales).at(-1)
  return ultimoCiclo?.compras[0]?.data ?? null
}

/** Decide a fórmula a partir da oferta da compra âncora do ciclo. */
function calcularExpiracao(ciclo: CicloBase, oferta: OfertaDaAncora | undefined): Date | null {
  const ancora = ciclo.compras[0]
  const nome = typeof oferta?.offerName === 'string' ? oferta.offerName.trim() : ''
  const renovacao =
    CODIGOS_RENOVACAO_ESPECIAIS.has(ancora.offerCode ?? '') ||
    oferta?.isRenewal === true ||
    (nome !== '' && tipoDeTurma(nome) === 'renovacao')

  if (renovacao) return computeExpirationFromPurchaseDate(ancora.data, ciclo.anos)
  if (!nome) return null

  const nomeComPeriodo = oferta?.periodYYMM ? `${nome} | ${oferta.periodYYMM}` : nome
  const ofertaParsed = parseOfferName(nomeComPeriodo)
  if (!ofertaParsed.valid) return null

  // parseTurmaName preserva o marcador histórico [2 anos] das ofertas base.
  return parseTurmaName(nomeComPeriodo).accessEndOgi
}

/** Uma escrita só é segura se nunca reduzir a expiração já guardada na AC. */
export function encurtaria(calculado: Date, acTem: Date | null): boolean {
  return acTem !== null && calculado.getTime() < acTem.getTime()
}

/** Identidade estável do ciclo: âncora, venda/oferta e duração do acesso. */
export function identidadeDoEvento(ciclo: CicloBase): string {
  const ancora = ciclo.compras[0]
  return JSON.stringify([
    ancora.data.toISOString(),
    ancora.transacao ?? null,
    ancora.offerCode ?? null,
    ancora.produtoId ?? null,
    ciclo.anos
  ])
}

interface SeletorManual {
  email?: string
  userId?: string
}

interface SyncOpcoes {
  dryRun?: boolean
  manual?: SeletorManual
}

/**
 * Percorre os alunos já sincronizados (ACRenewalData + HotmartSaleHistory,
 * ambos populados por outros processos) e escreve a expiração só por um
 * evento novo, por expiração vazia ou por uma selecção manual explícita.
 * SÓ escreve o campo de expiração — nunca mais nada.
 */
export async function syncAcExpirationDates(opcoes: SyncOpcoes = {}): Promise<AcExpirationSyncReport> {
  const dryRun = opcoes.dryRun !== false
  const manual = opcoes.manual
  if (manual && !manual.email && !manual.userId) {
    throw new Error('A execução manual exige email ou userId')
  }
  const report: AcExpirationSyncReport = {
    candidatesChecked: 0,
    alreadyInSync: 0,
    needsWrite: 0,
    written: 0,
    wouldWrite: 0,
    skippedRefunded: 0,
    skippedNoContact: 0,
    skippedNoHotmartData: 0,
    semTurma: 0,
    skippedWouldShorten: 0,
    bootstrapped: 0,
    skippedNoNewEvent: 0,
    divergentes: [],
    errors: []
  }

  const filtroAc = manual
    ? {
        ...(manual.email ? { email: manual.email.trim().toLowerCase() } : {}),
        ...(manual.userId ? { userId: manual.userId } : {})
      }
    : {}
  const acEntries = await ACRenewalDataReadModel.find(filtroAc)
    .select('userId email contactId expirationDate refundDate purchaseStatus')
    .lean()
    .exec() as Array<{
      userId: mongoose.Types.ObjectId
      email: string
      contactId: string | null
      expirationDate: Date | null
      refundDate: Date | null
      purchaseStatus: string | null
    }>

  const userIds = acEntries.map((e) => e.userId)
  const hotmartDocs = await HotmartSaleHistoryReadModel.find({ userId: { $in: userIds } })
    .select('userId sales latestApprovedDate latestTransactionStatus')
    .lean()
    .exec() as Array<{
      userId: mongoose.Types.ObjectId
      sales: VendaEntrada[] | null
      latestApprovedDate: Date | null
      latestTransactionStatus: string | null
    }>
  const hotmartByUserId = new Map(hotmartDocs.map((h) => [String(h.userId), h]))

  const estados = userIds.length === 0
    ? []
    : await AcExpirationEventStateReadModel.find({ userId: { $in: userIds } })
      .select('userId eventIdentity')
      .lean()
      .exec() as Array<{ userId: mongoose.Types.ObjectId; eventIdentity: string }>
  const estadoByUserId = new Map(estados.map((estado) => [String(estado.userId), estado]))

  const cicloByUserId = new Map(
    hotmartDocs.map((h) => [String(h.userId), agruparCiclos(h.sales ?? []).at(-1) ?? null])
  )
  const codigosOferta = [...new Set(
    [...cicloByUserId.values()]
      .map((ciclo) => ciclo?.compras[0]?.offerCode)
      .filter((codigo): codigo is string => typeof codigo === 'string' && codigo !== '')
  )]
  const ofertas = codigosOferta.length === 0
    ? []
    : await RenewalOfferReadModel.find({ offerCode: { $in: codigosOferta } })
      .select('offerCode offerName periodYYMM isRenewal')
      .lean()
      .exec() as OfertaDaAncora[]
  const ofertaByCode = new Map(ofertas.map((oferta) => [oferta.offerCode, oferta]))

  const avancarWatermark = async (userId: mongoose.Types.ObjectId, ciclo: CicloBase, eventIdentity: string) => {
    const ancora = ciclo.compras[0]
    await AcExpirationEventState.updateOne(
      { userId },
      {
        $set: {
          eventIdentity,
          anchorDate: ancora.data,
          anchorTransaction: ancora.transacao,
          anchorOfferCode: ancora.offerCode,
          anchorProductId: ancora.produtoId,
          cycleYears: ciclo.anos,
          handledAt: new Date()
        }
      },
      { upsert: true }
    )
    estadoByUserId.set(String(userId), { userId, eventIdentity })
  }

  for (const ac of acEntries) {
    if (ac.refundDate || ac.purchaseStatus === 'Reembolsada') {
      report.skippedRefunded += 1
      continue
    }

    const hm = hotmartByUserId.get(String(ac.userId))
    if (hm?.latestTransactionStatus && REFUND_TRANSACTION_STATUSES.has(hm.latestTransactionStatus)) {
      report.skippedRefunded += 1
      continue
    }

    const ciclo = cicloByUserId.get(String(ac.userId))
    const ancora = ciclo?.compras[0]
    if (!ciclo || !ancora) {
      report.skippedNoHotmartData += 1
      continue
    }

    const expiration = calcularExpiracao(ciclo, ofertaByCode.get(ancora.offerCode ?? ''))
    if (!expiration) {
      report.semTurma += 1
      continue
    }
    const encurta = encurtaria(expiration, ac.expirationDate)
    const eventIdentity = identidadeDoEvento(ciclo)
    const estado = estadoByUserId.get(String(ac.userId))
    const eventoNovo = estado?.eventIdentity !== eventIdentity
    const expiracaoVazia = !ac.expirationDate
    const elegivel = Boolean(manual) || expiracaoVazia || eventoNovo
    if (!ac.expirationDate || !sameDay(expiration, ac.expirationDate)) {
      report.divergentes.push({
        email: ac.email,
        acTem: ac.expirationDate,
        calculado: expiration,
        motivo: encurta ? 'encurtaria' : 'diferente'
      })
    }

    if (!hm?.latestApprovedDate) {
      if (encurta) report.skippedWouldShorten += 1
      report.skippedNoHotmartData += 1
      continue
    }

    if (!ac.contactId) {
      report.skippedNoContact += 1
      continue
    }

    if (encurta) {
      report.skippedWouldShorten += 1
      if (!dryRun && eventoNovo) await avancarWatermark(ac.userId, ciclo, eventIdentity)
      continue
    }

    if (ac.expirationDate && sameDay(expiration, ac.expirationDate)) {
      report.alreadyInSync += 1
      if (!dryRun && eventoNovo) await avancarWatermark(ac.userId, ciclo, eventIdentity)
      continue
    }

    if (!elegivel) {
      report.skippedNoNewEvent += 1
      continue
    }

    if (!estado && !manual && !expiracaoVazia) {
      if (!dryRun) {
        await avancarWatermark(ac.userId, ciclo, eventIdentity)
        report.bootstrapped += 1
      }
      continue
    }

    report.candidatesChecked += 1

    report.needsWrite += 1
    if (dryRun) {
      report.wouldWrite += 1
      continue
    }

    try {
      const ok = await activeCampaignService.updateContactField(
        ac.email,
        AC_EXPIRATION_DATE_FIELD_ID,
        formatDateYYYYMMDD(expiration)
      )
      if (ok) {
        report.written += 1
        await avancarWatermark(ac.userId, ciclo, eventIdentity)
      }
      else report.errors.push({ email: ac.email, error: 'updateContactField devolveu false' })
    } catch (error: any) {
      report.errors.push({ email: ac.email, error: error?.message || 'Erro desconhecido ao escrever na AC' })
    }
  }

  return report
}

export default syncAcExpirationDates
