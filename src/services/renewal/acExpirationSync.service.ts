// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/acExpirationSync.service.ts
// Escreve a "Data de expiração" (AC field 332) — o ÚNICO campo que
// este sistema escreve na AC. As automações da AC correm no fim de
// cada mês, disparadas pelo valor que aqui deixamos, não por cada
// escrita nossa — por isso não há urgência de "só escrever se mudou"
// por causa de retrigger, mas fazemo-lo na mesma para poupar chamadas.
//
// Regra da expiração, escolhida primeiro pela turma actual do aluno:
//   base       → período/nome da turma (incluindo [2 anos]);
//   renovação  → compra âncora + 12 meses × anos do ciclo.
// Sem turma datável, a oferta da compra âncora é o recurso para compras novas.
// Nos dois ramos, o resultado é o último instante UTC do mês.
//
// Um estado interno por aluno identifica o último ciclo tratado. O campo
// de compra da AC não é watermark: prestações podem mudá-lo sem criarem
// um ciclo, e atrasos de sincronização fariam perder eventos.
//
// NUNCA escreve para quem está reembolsado (nem data de compra, nem
// tags, nem mais nada — só a expiração, e só quando faz sentido).
// ════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import ACRenewalData from '../../models/ACRenewalData'
import AcExpirationEventState from '../../models/AcExpirationEventState'
import HotmartSaleHistory from '../../models/HotmartSaleHistory'
import RenewalOffer from '../../models/RenewalOffer'
import AcWriteLog from '../../models/renewal/AcWriteLog'
import User from '../../models/user'
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
  claimConflicts: number
  confirmationPending: number
  divergentes: Array<{ email: string; acTem: Date | null; calculado: Date; motivo: 'encurtaria' | 'diferente' }>
  errors: Array<{ email: string; error: string }>
}

type MongooseReadModel = { find: (...args: any[]) => any }
const ACRenewalDataReadModel = ACRenewalData as unknown as MongooseReadModel
const HotmartSaleHistoryReadModel = HotmartSaleHistory as unknown as MongooseReadModel
const RenewalOfferReadModel = RenewalOffer as unknown as MongooseReadModel
const UserReadModel = User as unknown as MongooseReadModel
const AcExpirationEventStateReadModel = AcExpirationEventState as unknown as MongooseReadModel
const AcExpirationEventStateWriteModel = AcExpirationEventState as any

const CLAIM_LEASE_MS = 5 * 60 * 1000

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

function chaveIdempotente(partes: unknown[]): string {
  return JSON.stringify(partes)
}

function erroDeChaveDuplicada(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000
}

/**
 * Último instante UTC do mesmo mês, `anos` depois da compra.
 */
export function computeExpirationFromPurchaseDate(purchaseDate: Date, anos = 1): Date {
  return new Date(Date.UTC(purchaseDate.getUTCFullYear() + anos, purchaseDate.getUTCMonth() + 1, 0, 23, 59, 59, 999))
}

/** Compra âncora do ciclo de acesso mais recente; vendas inválidas não contam. */
export function dataBaseDoAluno(sales: VendaEntrada[]): Date | null {
  const ultimoCiclo = agruparCiclos(sales).filter((c) => c.compras.some((compra) => !compra.reembolsada)).at(-1)
  return ultimoCiclo?.compras[0]?.data ?? null
}

/** Turma actual: a entrada activa mais recente da Hotmart. */
function nomeDaTurmaActual(user: {
  hotmart?: { enrolledClasses?: Array<{ className?: string; isActive?: boolean }> }
} | undefined): string | null {
  const turmas = user?.hotmart?.enrolledClasses ?? []
  const activas = turmas.filter((turma) => turma.className?.trim() && turma.isActive !== false)
  const escolhida = activas.at(-1) ?? turmas.filter((turma) => turma.className?.trim()).at(-1)
  const nome = escolhida?.className?.trim() ?? ''
  return nome && parseTurmaName(nome).hasExpiry ? nome : null
}

/** Decide a fórmula pela turma actual; sem turma datável, usa a oferta. */
function calcularExpiracao(
  ciclo: CicloBase,
  oferta: OfertaDaAncora | undefined,
  nomeTurmaActual: string | null
): Date | null {
  const ancora = ciclo.compras[0]
  if (CODIGOS_RENOVACAO_ESPECIAIS.has(ancora.offerCode ?? '')) {
    return computeExpirationFromPurchaseDate(ancora.data, ciclo.anos)
  }

  if (nomeTurmaActual) {
    if (tipoDeTurma(nomeTurmaActual) === 'renovacao') {
      return computeExpirationFromPurchaseDate(ancora.data, ciclo.anos)
    }
    return parseTurmaName(nomeTurmaActual).accessEndOgi
  }

  const nome = typeof oferta?.offerName === 'string' ? oferta.offerName.trim() : ''
  const renovacao =
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

/** Chave da venda congelada no primeiro avistamento do ciclo. */
export function identidadeDaVenda(ciclo: CicloBase): string {
  const ancora = ciclo.compras[0]
  const transaction = ancora.transacao?.trim()
  if (transaction) return `transaction:${transaction}`
  const offerCode = ancora.offerCode?.trim()
  if (offerCode) return `offer:${offerCode}`
  const productId = ancora.produtoId?.trim()
  if (productId) return `product:${productId}`
  return `anchor:${ancora.data.toISOString()}`
}

export function identidadeDoEvento(ciclo: CicloBase, saleIdentity = identidadeDaVenda(ciclo)): string {
  const ancora = ciclo.compras[0]
  return JSON.stringify([ancora.data.toISOString(), ciclo.anos, saleIdentity])
}

function identidadeDaVendaPersistida(eventIdentity: string | null | undefined): string | null {
  if (!eventIdentity) return null
  try {
    const partes = JSON.parse(eventIdentity)
    return Array.isArray(partes) && typeof partes[2] === 'string' ? partes[2] : null
  } catch {
    return null
  }
}

interface EstadoEvento {
  userId: mongoose.Types.ObjectId
  status?: 'livre' | 'tratado' | 'claimado' | 'finalizacao-pendente' | 'confirmacao-pendente'
  eventIdentity: string | null
  saleIdentity?: string | null
  anchorDate: Date | null
  cycleYears: 1 | 2 | null
  emptyExpirationSnapshotAt?: Date | null
  claimToken?: string | null
  leaseUntil?: Date | null
  claimedAt?: Date | null
  pendingEventIdentity?: string | null
  pendingSaleIdentity?: string | null
  pendingAnchorDate?: Date | null
  pendingCycleYears?: 1 | 2 | null
  pendingExpiration?: Date | null
  pendingEmptyExpirationSnapshotAt?: Date | null
  pendingReason?: 'bootstrap' | 'already-right' | 'would-shorten' | 'external-write' | null
}

function compararComWatermark(ciclo: CicloBase, estado: EstadoEvento | undefined): -1 | 0 | 1 {
  if (!estado?.anchorDate || !estado.cycleYears) return 1
  const ancora = ciclo.compras[0].data.getTime()
  const anterior = new Date(estado.anchorDate).getTime()
  if (ancora < anterior) return -1
  if (ancora > anterior) return 1
  if (ciclo.anos < estado.cycleYears) return -1
  if (ciclo.anos > estado.cycleYears) return 1
  return 0
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
    claimConflicts: 0,
    confirmationPending: 0,
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
    .select('userId email contactId expirationDate refundDate purchaseStatus lastSyncedAt syncError')
    .lean()
    .exec() as Array<{
      userId: mongoose.Types.ObjectId
      email: string
      contactId: string | null
      expirationDate: Date | null
      refundDate: Date | null
      purchaseStatus: string | null
      lastSyncedAt: Date
      syncError: string | null
    }>

  const userIds = acEntries.map((e) => e.userId)
  const [hotmartDocs, users] = await Promise.all([
    HotmartSaleHistoryReadModel.find({ userId: { $in: userIds } })
      .select('userId sales latestApprovedDate latestTransactionStatus')
      .lean()
      .exec() as Promise<Array<{
        userId: mongoose.Types.ObjectId
        sales: VendaEntrada[] | null
        latestApprovedDate: Date | null
        latestTransactionStatus: string | null
      }>>,
    UserReadModel.find({ _id: { $in: userIds } })
      .select('_id hotmart.enrolledClasses')
      .lean()
      .exec() as Promise<Array<{
        _id: mongoose.Types.ObjectId
        hotmart?: { enrolledClasses?: Array<{ className?: string; isActive?: boolean }> }
      }>>
  ])
  const hotmartByUserId = new Map(hotmartDocs.map((h) => [String(h.userId), h]))
  const turmaActualByUserId = new Map(
    users.map((user) => [String(user._id), nomeDaTurmaActual(user)])
  )

  const estados = userIds.length === 0
    ? []
    : await AcExpirationEventStateReadModel.find({ userId: { $in: userIds } })
      .select('userId status eventIdentity saleIdentity anchorDate cycleYears emptyExpirationSnapshotAt claimToken leaseUntil claimedAt pendingEventIdentity pendingSaleIdentity pendingAnchorDate pendingCycleYears pendingExpiration pendingEmptyExpirationSnapshotAt pendingReason')
      .lean()
      .exec() as EstadoEvento[]
  const estadoByUserId = new Map(estados.map((estado) => [String(estado.userId), estado]))

  const cicloByUserId = new Map(
    hotmartDocs.map((h) => [
      String(h.userId),
      agruparCiclos(h.sales ?? []).filter((c) => c.compras.some((compra) => !compra.reembolsada)).at(-1) ?? null
    ])
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

  const reclamarEvento = async (
    userId: mongoose.Types.ObjectId,
    ciclo: CicloBase,
    eventIdentity: string,
    saleIdentity: string,
    expiration: Date,
    reason: 'bootstrap' | 'already-right' | 'would-shorten' | 'external-write',
    emptyExpirationSnapshotAt: Date | null = null
  ): Promise<EstadoEvento | null> => {
    const agora = new Date()
    const ancora = ciclo.compras[0].data
    const leaseUntil = new Date(agora.getTime() + CLAIM_LEASE_MS)
    const claimToken = randomUUID()
    const filtroStatus = manual
      ? {
          $or: [
            { status: { $in: ['livre', 'tratado'] } },
            { status: { $exists: false } },
            { leaseUntil: { $lte: agora } }
          ]
        }
      : {
          $or: [
            { status: { $in: ['livre', 'tratado'] } },
            { status: { $exists: false } }
          ]
        }
    const progressoTratado = manual && !emptyExpirationSnapshotAt
      ? { anchorDate: ancora, cycleYears: { $lte: ciclo.anos } }
      : { anchorDate: ancora, cycleYears: { $lt: ciclo.anos } }
    const progressoPendente = manual
      ? { pendingAnchorDate: ancora, pendingCycleYears: { $lte: ciclo.anos } }
      : { pendingAnchorDate: ancora, pendingCycleYears: { $lt: ciclo.anos } }

    const episodioVazio = emptyExpirationSnapshotAt
      ? {
          anchorDate: ancora,
          cycleYears: ciclo.anos,
          $or: [
            { emptyExpirationSnapshotAt: null },
            { emptyExpirationSnapshotAt: { $exists: false } },
            { emptyExpirationSnapshotAt: { $lt: emptyExpirationSnapshotAt } }
          ]
        }
      : null

    try {
      return await AcExpirationEventStateWriteModel.findOneAndUpdate(
        {
          userId,
          $and: [
            filtroStatus,
            {
              $or: [
                { anchorDate: null },
                { anchorDate: { $exists: false } },
                { anchorDate: { $lt: ancora } },
                progressoTratado,
                ...(episodioVazio ? [episodioVazio] : [])
              ]
            },
            {
              $or: [
                { pendingAnchorDate: null },
                { pendingAnchorDate: { $exists: false } },
                { pendingAnchorDate: { $lt: ancora } },
                progressoPendente
              ]
            }
          ]
        },
        {
          $setOnInsert: { userId },
          $set: {
            status: reason === 'external-write' ? 'claimado' : 'finalizacao-pendente',
            claimToken,
            leaseUntil,
            claimedAt: agora,
            pendingEventIdentity: eventIdentity,
            pendingSaleIdentity: saleIdentity,
            pendingAnchorDate: ancora,
            pendingCycleYears: ciclo.anos,
            pendingExpiration: expiration,
            pendingEmptyExpirationSnapshotAt: emptyExpirationSnapshotAt,
            pendingReason: reason
          }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean().exec() as EstadoEvento | null
    } catch (error: any) {
      // Duas corridas podem tentar o upsert inicial; o índice único decide a vencedora.
      if (error?.code === 11000) return null
      throw error
    }
  }

  const finalizarEvento = async (
    userId: mongoose.Types.ObjectId,
    eventIdentity: string,
    anchorDate: Date,
    cycleYears: 1 | 2,
    saleIdentity: string,
    expectedStatus: 'claimado' | 'finalizacao-pendente' | 'confirmacao-pendente',
    emptyExpirationSnapshotAt: Date | null,
    filtroCas: { claimToken?: string; pendingEventIdentity?: string }
  ): Promise<EstadoEvento | null> => {
    return await AcExpirationEventStateWriteModel.findOneAndUpdate(
      { userId, status: expectedStatus, ...filtroCas },
      {
        $set: {
          status: 'tratado',
          eventIdentity,
          saleIdentity,
          anchorDate,
          cycleYears,
          handledAt: new Date(),
          ...(emptyExpirationSnapshotAt ? { emptyExpirationSnapshotAt } : {})
        },
        $unset: {
          claimToken: 1,
          leaseUntil: 1,
          claimedAt: 1,
          pendingEventIdentity: 1,
          pendingSaleIdentity: 1,
          pendingAnchorDate: 1,
          pendingCycleYears: 1,
          pendingExpiration: 1,
          pendingEmptyExpirationSnapshotAt: 1,
          pendingReason: 1
        }
      },
      { new: true }
    ).lean().exec() as EstadoEvento | null
  }

  const libertarClaim = async (estado: EstadoEvento): Promise<void> => {
    if (!estado.claimToken) return
    await AcExpirationEventStateWriteModel.findOneAndUpdate(
      {
        userId: estado.userId,
        status: { $in: ['claimado', 'finalizacao-pendente'] },
        claimToken: estado.claimToken
      },
      {
        $set: { status: estado.eventIdentity ? 'tratado' : 'livre' },
        $unset: {
          claimToken: 1,
          leaseUntil: 1,
          claimedAt: 1,
          pendingEventIdentity: 1,
          pendingSaleIdentity: 1,
          pendingAnchorDate: 1,
          pendingCycleYears: 1,
          pendingExpiration: 1,
          pendingEmptyExpirationSnapshotAt: 1,
          pendingReason: 1
        }
      },
      { new: true }
    ).lean().exec()
  }

  const marcarConfirmacaoPendente = async (estado: EstadoEvento): Promise<EstadoEvento | null> => {
    if (!estado.claimToken) return null
    return await AcExpirationEventStateWriteModel.findOneAndUpdate(
      { userId: estado.userId, status: 'claimado', claimToken: estado.claimToken },
      { $set: { status: 'confirmacao-pendente' } },
      { new: true }
    ).lean().exec() as EstadoEvento | null
  }

  const registarErro = (email: string, error: unknown) => {
    const mensagem = error instanceof Error ? error.message : 'Erro desconhecido no watermark'
    report.errors.push({ email, error: mensagem })
  }

  const criarRasto = async (
    email: string,
    antes: string | null,
    depois: string | null,
    accao: 'escrito' | 'recusado',
    motivo: string | undefined,
    idempotencyKey: string,
    tolerarDuplicado = false
  ): Promise<any | null> => {
    try {
      return await AcWriteLog.create({
        quando: new Date(),
        servico: 'expiracao',
        email,
        campo: AC_EXPIRATION_DATE_FIELD_ID,
        antes,
        depois,
        accao,
        ...(motivo ? { motivo } : {}),
        dryRun,
        idempotencyKey
      })
    } catch (error) {
      if (tolerarDuplicado && erroDeChaveDuplicada(error)) return null
      throw error
    }
  }

  const marcarRastoRecusado = async (id: unknown): Promise<void> => {
    try {
      await AcWriteLog.findByIdAndUpdate(id, {
        $set: { accao: 'recusado', motivo: 'falhaExterna' }
      })
    } catch {
      // A intenção criada antes da chamada continua a preservar a tentativa.
    }
  }

  for (const ac of acEntries) {
    try {
      if (ac.refundDate || ac.purchaseStatus === 'Reembolsada') {
        const antes = ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null
        const eventoReembolsoAc = ac.refundDate
          ? ac.refundDate.toISOString()
          : `estado:${ac.purchaseStatus}`
        await criarRasto(
          ac.email,
          antes,
          null,
          'recusado',
          'reembolsado',
          chaveIdempotente([
            'expiracao', String(ac.userId), 'reembolso-ac', eventoReembolsoAc, 'reembolsado', dryRun
          ]),
          true
        )
        report.skippedRefunded += 1
        continue
      }

      const hm = hotmartByUserId.get(String(ac.userId))
      if (hm?.latestTransactionStatus && REFUND_TRANSACTION_STATUSES.has(hm.latestTransactionStatus)) {
        const antes = ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null
        const vendaReembolsada = [...(hm.sales ?? [])]
          .filter((venda) => venda.transactionStatus === hm.latestTransactionStatus)
          .sort((a, b) => {
            const dataA = a.orderDate ?? a.approvedDate
            const dataB = b.orderDate ?? b.approvedDate
            return (dataA?.getTime() ?? 0) - (dataB?.getTime() ?? 0)
          })
          .at(-1)
        const eventoReembolsoHotmart = chaveIdempotente([
          hm.latestTransactionStatus,
          vendaReembolsada?.transaction ?? null,
          (vendaReembolsada?.orderDate ?? vendaReembolsada?.approvedDate ?? hm.latestApprovedDate)?.toISOString() ?? null
        ])
        await criarRasto(
          ac.email,
          antes,
          null,
          'recusado',
          'reembolsado',
          chaveIdempotente([
            'expiracao', String(ac.userId), 'reembolso-hotmart', eventoReembolsoHotmart, 'reembolsado', dryRun
          ]),
          true
        )
        report.skippedRefunded += 1
        continue
      }

      const ciclo = cicloByUserId.get(String(ac.userId))
      const ancora = ciclo?.compras[0]
      if (!ciclo || !ancora) {
        report.skippedNoHotmartData += 1
        const antes = ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null
        await criarRasto(
          ac.email,
          antes,
          null,
          'recusado',
          'semVenda',
          chaveIdempotente([
            'expiracao', String(ac.userId), antes, null, 'semVenda', dryRun,
            new Date(ac.lastSyncedAt).toISOString()
          ]),
          true
        )
        continue
      }

      const expiration = calcularExpiracao(
        ciclo,
        ofertaByCode.get(ancora.offerCode ?? ''),
        turmaActualByUserId.get(String(ac.userId)) ?? null
      )
      if (!expiration) {
        report.semTurma += 1
        const antes = ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null
        const identidadeSemTurma = identidadeDoEvento(ciclo)
        await criarRasto(
          ac.email,
          antes,
          null,
          'recusado',
          'semTurma',
          chaveIdempotente(['expiracao', String(ac.userId), identidadeSemTurma, antes, null, 'semTurma', dryRun]),
          true
        )
        continue
      }

      const encurta = encurtaria(expiration, ac.expirationDate)
      let estado = estadoByUserId.get(String(ac.userId))

      if (estado?.status === 'finalizacao-pendente') {
        if (dryRun) {
          report.confirmationPending += 1
          continue
        }
        const saleIdentityPendente = estado.pendingSaleIdentity ??
          identidadeDaVendaPersistida(estado.pendingEventIdentity) ??
          identidadeDaVenda(ciclo)
        const motivoPendente = estado.pendingReason
        const finalizado = await finalizarEvento(
          ac.userId,
          estado.pendingEventIdentity!,
          new Date(estado.pendingAnchorDate!),
          estado.pendingCycleYears!,
          saleIdentityPendente,
          'finalizacao-pendente',
          null,
          { claimToken: estado.claimToken! }
        )
        if (!finalizado) {
          report.claimConflicts += 1
          continue
        }
        estado = finalizado
        estadoByUserId.set(String(ac.userId), finalizado)
        if (motivoPendente === 'bootstrap') report.bootstrapped += 1
        if (motivoPendente === 'already-right') report.alreadyInSync += 1
      }

      if (estado?.status === 'claimado' || estado?.status === 'confirmacao-pendente') {
        if (dryRun) {
          report.confirmationPending += 1
          continue
        }
        const pendenteConfirmado = Boolean(
          estado.pendingExpiration &&
          ac.expirationDate &&
          sameDay(new Date(estado.pendingExpiration), ac.expirationDate)
        )
        const leaseExpirada = Boolean(
          estado.leaseUntil && new Date(estado.leaseUntil).getTime() <= Date.now()
        )
        const retomaManual = Boolean(manual) && leaseExpirada
        if (!pendenteConfirmado && !retomaManual) {
          report.confirmationPending += 1
          continue
        }

        if (pendenteConfirmado) {
          const saleIdentityPendente = estado.pendingSaleIdentity ??
            identidadeDaVendaPersistida(estado.pendingEventIdentity) ??
            identidadeDaVenda(ciclo)
          const finalizado = await finalizarEvento(
            ac.userId,
            estado.pendingEventIdentity!,
            new Date(estado.pendingAnchorDate!),
            estado.pendingCycleYears!,
            saleIdentityPendente,
            estado.status,
            estado.pendingEmptyExpirationSnapshotAt
              ? new Date(estado.pendingEmptyExpirationSnapshotAt)
              : null,
            { pendingEventIdentity: estado.pendingEventIdentity! }
          )
          if (!finalizado) {
            report.claimConflicts += 1
            continue
          }
          estado = finalizado
          estadoByUserId.set(String(ac.userId), finalizado)
          report.alreadyInSync += 1
        }
      }

      const relacao = compararComWatermark(ciclo, estado)
      if (relacao < 0) {
        report.skippedNoNewEvent += 1
        continue
      }
      const eventoNovo = relacao > 0
      const mesmaAncoraTratada = Boolean(
        estado?.anchorDate && new Date(estado.anchorDate).getTime() === ancora.data.getTime()
      )
      const mesmaAncoraPendente = Boolean(
        estado?.pendingAnchorDate && new Date(estado.pendingAnchorDate).getTime() === ancora.data.getTime()
      )
      const saleIdentity =
        (mesmaAncoraPendente
          ? estado?.pendingSaleIdentity ?? identidadeDaVendaPersistida(estado?.pendingEventIdentity)
          : null) ??
        (mesmaAncoraTratada
          ? estado?.saleIdentity ?? identidadeDaVendaPersistida(estado?.eventIdentity)
          : null) ??
        identidadeDaVenda(ciclo)
      const eventIdentity = identidadeDoEvento(ciclo, saleIdentity)
      const expiracaoVazia = !ac.expirationDate && ac.syncError === null
      const emptyExpirationSnapshotAt = expiracaoVazia ? new Date(ac.lastSyncedAt) : null
      const episodioVazioNovo = Boolean(
        emptyExpirationSnapshotAt &&
        (!estado?.emptyExpirationSnapshotAt ||
          new Date(estado.emptyExpirationSnapshotAt).getTime() < emptyExpirationSnapshotAt.getTime())
      )
      const elegivel = Boolean(manual) || episodioVazioNovo || eventoNovo

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
        if (elegivel) {
          await criarRasto(
            ac.email,
            ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null,
            formatDateYYYYMMDD(expiration),
            'recusado',
            'semVenda',
            chaveIdempotente(['expiracao', String(ac.userId), eventIdentity, 'semVenda', dryRun]),
            true
          )
        }
        continue
      }

      if (!ac.contactId) {
        report.skippedNoContact += 1
        if (elegivel) {
          await criarRasto(
            ac.email,
            ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null,
            formatDateYYYYMMDD(expiration),
            'recusado',
            'semContacto',
            chaveIdempotente([
              'expiracao', String(ac.userId), eventIdentity, 'semContacto', dryRun,
              emptyExpirationSnapshotAt?.toISOString() ?? null
            ]),
            true
          )
        }
        continue
      }

      if (encurta || (ac.expirationDate && sameDay(expiration, ac.expirationDate))) {
        if (encurta) report.skippedWouldShorten += 1
        else if (estado?.status !== 'tratado' || eventoNovo) report.alreadyInSync += 1
        let claim: EstadoEvento | null = null
        if (!dryRun && (eventoNovo || Boolean(manual))) {
          const reason = encurta ? 'would-shorten' : 'already-right'
          claim = await reclamarEvento(ac.userId, ciclo, eventIdentity, saleIdentity, expiration, reason)
          if (!claim) {
            report.claimConflicts += 1
            continue
          }
        }
        if (encurta && elegivel) {
          try {
            await criarRasto(
              ac.email,
              formatDateYYYYMMDD(ac.expirationDate!),
              formatDateYYYYMMDD(expiration),
              'recusado',
              'encurtaria',
              dryRun
                ? chaveIdempotente(['expiracao', String(ac.userId), eventIdentity, 'encurtaria', dryRun])
                : chaveIdempotente(['expiracao', String(ac.userId), eventIdentity, 'encurtaria', claim!.claimToken]),
              dryRun
            )
          } catch (error) {
            if (claim) {
              try {
                await libertarClaim(claim)
              } catch (releaseError) {
                registarErro(ac.email, releaseError)
              }
            }
            throw error
          }
        }
        if (claim) {
          const finalizado = await finalizarEvento(
            ac.userId,
            eventIdentity,
            ancora.data,
            ciclo.anos,
            saleIdentity,
            'finalizacao-pendente',
            null,
            { claimToken: claim.claimToken! }
          )
          if (!finalizado) report.claimConflicts += 1
          else estadoByUserId.set(String(ac.userId), finalizado)
        }
        continue
      }

      if (!elegivel) {
        report.skippedNoNewEvent += 1
        continue
      }

      if (!estado && !manual && !expiracaoVazia) {
        if (!dryRun) {
          const claim = await reclamarEvento(
            ac.userId,
            ciclo,
            eventIdentity,
            saleIdentity,
            expiration,
            'bootstrap'
          )
          if (!claim) {
            report.claimConflicts += 1
            continue
          }
          const finalizado = await finalizarEvento(
            ac.userId,
            eventIdentity,
            ancora.data,
            ciclo.anos,
            saleIdentity,
            'finalizacao-pendente',
            null,
            { claimToken: claim.claimToken! }
          )
          if (!finalizado) report.claimConflicts += 1
          else {
            estadoByUserId.set(String(ac.userId), finalizado)
            report.bootstrapped += 1
          }
        }
        continue
      }

      report.candidatesChecked += 1
      report.needsWrite += 1
      if (dryRun) {
        await criarRasto(
          ac.email,
          ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null,
          formatDateYYYYMMDD(expiration),
          'escrito',
          undefined,
          chaveIdempotente([
            'expiracao', String(ac.userId), eventIdentity, 'proposta', dryRun,
            emptyExpirationSnapshotAt?.toISOString() ?? null
          ]),
          true
        )
        report.wouldWrite += 1
        continue
      }

      const claim = await reclamarEvento(
        ac.userId,
        ciclo,
        eventIdentity,
        saleIdentity,
        expiration,
        'external-write',
        emptyExpirationSnapshotAt
      )
      if (!claim) {
        report.claimConflicts += 1
        continue
      }

      let rasto: any
      try {
        rasto = await criarRasto(
          ac.email,
          ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null,
          formatDateYYYYMMDD(expiration),
          'escrito',
          undefined,
          chaveIdempotente(['expiracao', String(ac.userId), eventIdentity, 'tentativa', claim.claimToken])
        )
      } catch (error) {
        registarErro(ac.email, error)
        try {
          await libertarClaim(claim)
        } catch (releaseError) {
          registarErro(ac.email, releaseError)
        }
        continue
      }

      let ok = false
      try {
        ok = await activeCampaignService.updateContactField(
          ac.email,
          AC_EXPIRATION_DATE_FIELD_ID,
          formatDateYYYYMMDD(expiration)
        )
      } catch (error) {
        await marcarRastoRecusado(rasto._id)
        registarErro(ac.email, error)
        try {
          await libertarClaim(claim)
        } catch (releaseError) {
          registarErro(ac.email, releaseError)
        }
        continue
      }

      if (!ok) {
        await marcarRastoRecusado(rasto._id)
        report.errors.push({ email: ac.email, error: 'updateContactField devolveu false' })
        try {
          await libertarClaim(claim)
        } catch (releaseError) {
          registarErro(ac.email, releaseError)
        }
        continue
      }

      report.written += 1
      const confirmado = await marcarConfirmacaoPendente(claim)
      if (!confirmado) {
        report.claimConflicts += 1
        continue
      }
      const finalizado = await finalizarEvento(
        ac.userId,
        eventIdentity,
        ancora.data,
        ciclo.anos,
        saleIdentity,
        'confirmacao-pendente',
        confirmado.pendingEmptyExpirationSnapshotAt
          ? new Date(confirmado.pendingEmptyExpirationSnapshotAt)
          : null,
        { claimToken: confirmado.claimToken! }
      )
      if (!finalizado) report.claimConflicts += 1
      else estadoByUserId.set(String(ac.userId), finalizado)
    } catch (error) {
      registarErro(ac.email, error)
    }
  }

  return report
}

export default syncAcExpirationDates
