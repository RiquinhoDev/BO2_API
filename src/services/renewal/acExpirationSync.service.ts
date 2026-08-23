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
// Fonte da "compra nova": compara HotmartSaleHistory.latestApprovedDate
// (o que a Hotmart diz agora — já sincronizado por outro cron/botão)
// com ACRenewalData.purchaseDate (o que a AC tinha na última leitura).
// Só escreve quando os dois não batem certo. Por defeito corre em dry-run;
// o pipeline é o único ponto que pode autorizar a escrita real.
//
// NUNCA escreve para quem está reembolsado (nem data de compra, nem
// tags, nem mais nada — só a expiração, e só quando faz sentido).
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import ACRenewalData from '../../models/ACRenewalData'
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
  divergentes: Array<{ email: string; acTem: Date | null; calculado: Date; motivo: 'encurtaria' | 'diferente' }>
  errors: Array<{ email: string; error: string }>
}

type MongooseReadModel = { find: (...args: any[]) => any }
const ACRenewalDataReadModel = ACRenewalData as unknown as MongooseReadModel
const HotmartSaleHistoryReadModel = HotmartSaleHistory as unknown as MongooseReadModel
const RenewalOfferReadModel = RenewalOffer as unknown as MongooseReadModel

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

/**
 * Percorre os alunos já sincronizados (ACRenewalData + HotmartSaleHistory,
 * ambos populados por outros processos) e escreve a expiração só para
 * quem tem uma compra na Hotmart mais recente do que a AC ainda reflecte.
 * SÓ escreve o campo de expiração — nunca mais nada.
 */
export async function syncAcExpirationDates(opcoes: { dryRun?: boolean } = {}): Promise<AcExpirationSyncReport> {
  const dryRun = opcoes.dryRun !== false
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
    divergentes: [],
    errors: []
  }

  const acEntries = await ACRenewalDataReadModel.find({})
    .select('userId email contactId purchaseDate expirationDate refundDate purchaseStatus')
    .lean()
    .exec() as Array<{
      userId: mongoose.Types.ObjectId
      email: string
      contactId: string | null
      purchaseDate: Date | null
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
    if (!ac.expirationDate || !sameDay(expiration, ac.expirationDate)) {
      report.divergentes.push({
        email: ac.email,
        acTem: ac.expirationDate,
        calculado: expiration,
        motivo: encurta ? 'encurtaria' : 'diferente'
      })
    }

    if (encurta) {
      report.skippedWouldShorten += 1
      continue
    }

    if (!hm?.latestApprovedDate) {
      report.skippedNoHotmartData += 1
      continue
    }

    if (!ac.contactId) {
      report.skippedNoContact += 1
      continue
    }

    report.candidatesChecked += 1

    if (ac.purchaseDate && sameDay(ac.purchaseDate, hm.latestApprovedDate)) {
      report.alreadyInSync += 1
      continue
    }

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
      if (ok) report.written += 1
      else report.errors.push({ email: ac.email, error: 'updateContactField devolveu false' })
    } catch (error: any) {
      report.errors.push({ email: ac.email, error: error?.message || 'Erro desconhecido ao escrever na AC' })
    }
  }

  return report
}

export default syncAcExpirationDates
