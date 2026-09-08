import { randomUUID } from 'node:crypto'
import type mongoose from 'mongoose'
import AcExpirationEventState from '../../models/AcExpirationEventState'
import AcWriteLog from '../../models/renewal/AcWriteLog'
import { AC_EXPIRATION_DATE_FIELD_ID } from './acRenewalDataSync.service'
import type { AcExpirationSyncReport, EstadoEvento, SeletorManual } from './acExpirationSync.service'
import type { CicloBase } from './renewalTimeline.types'
import { mainParityLocalMutationStarted } from './mainParityExecution'

const CLAIM_LEASE_MS = 5 * 60 * 1000
const EventStateWriteModel = AcExpirationEventState

function erroDeChaveDuplicada(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
}

export function createAcExpirationEventStore(options: {
  manual?: SeletorManual
  dryRun: boolean
  report: AcExpirationSyncReport
}) {
  const { manual, dryRun, report } = options
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
      mainParityLocalMutationStarted()
      return await EventStateWriteModel.findOneAndUpdate(
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
    } catch (error: unknown) {
      // Duas corridas podem tentar o upsert inicial; o índice único decide a vencedora.
      if (erroDeChaveDuplicada(error)) return null
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
    mainParityLocalMutationStarted()
    return await EventStateWriteModel.findOneAndUpdate(
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
    mainParityLocalMutationStarted()
    await EventStateWriteModel.findOneAndUpdate(
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
    mainParityLocalMutationStarted()
    return await EventStateWriteModel.findOneAndUpdate(
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
  ): Promise<{ _id?: unknown } | null> => {
    try {
      mainParityLocalMutationStarted()
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
      mainParityLocalMutationStarted()
      await AcWriteLog.findByIdAndUpdate(id, {
        $set: { accao: 'recusado', motivo: 'falhaExterna' }
      })
    } catch {
      // A intenção criada antes da chamada continua a preservar a tentativa.
    }
  }


  return { reclamarEvento, finalizarEvento, libertarClaim, marcarConfirmacaoPendente, registarErro, criarRasto, marcarRastoRecusado }
}
