import { randomUUID } from 'node:crypto'
import ACRenewalData from '../../models/ACRenewalData'
import HotmartSaleHistory from '../../models/HotmartSaleHistory'
import Product from '../../models/product/Product'
import UserProduct from '../../models/UserProduct'
import AcWriteLog from '../../models/renewal/AcWriteLog'
import AcPurchaseDateEventState from '../../models/renewal/AcPurchaseDateEventState'
import { activeCampaignService } from '../activeCampaign/activeCampaignService'
import { agruparCiclos } from './renewalCycles'
import type { CicloBase, VendaEntrada } from './renewalTimeline.types'
import { readAcPurchaseDateFieldId } from '../../config/renewalEnvironment'
import { collectCappedCursor } from './boundedMongoCursor'
import {
  mainParityLocalMutationStarted,
  mainParityProviderStarted,
  mainParityProviderSucceeded,
} from './mainParityExecution'

const CAMPO_DATA_COMPRA_AC = 334
const VINTE_QUATRO_HORAS_MS = 24 * 60 * 60 * 1000
const CLAIM_LEASE_MS = 5 * 60 * 1000
const MODO_PRESTACOES = 'MULTIPLE_PAYMENTS'
const READ_BATCH_SIZE = 200
const MAX_ACTIVE_STUDENTS = 20_000

/** R1: prestações usam a primeira cobrança; compras avulsas, a última. */
export function dataCompraDoCiclo(ciclo: CicloBase): Date | null {
  const compras = ciclo.compras
  if (!compras.length) return null
  const ePrestacao = compras.length > 1 && compras.some(
    (compra) => String(compra.paymentMode ?? '').toUpperCase() === MODO_PRESTACOES
  )
  return (ePrestacao ? compras[0] : compras[compras.length - 1])?.data ?? null
}

export interface ReconcileReport {
  verificados: number
  escritos: number
  jaCertos: number
  semDados: number
  erros: number
  alteracoes: Array<{ email: string; antes: string | null; depois: string }>
}

interface PurchaseState {
  userId: unknown
  status?: string
  eventIdentity?: string | null
  pendingEventIdentity?: string | null
  pendingValue?: string | null
  claimToken?: string | null
}

interface CreatedWriteLog { _id?: unknown }

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10)
}

function chaveIdempotente(partes: unknown[]): string {
  return JSON.stringify(partes)
}

function erroDeChaveDuplicada(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000
}

function validarCampoDataCompra(): void {
  const configurado = readAcPurchaseDateFieldId()
  if (configurado !== undefined && Number(configurado) !== CAMPO_DATA_COMPRA_AC) {
    throw new Error(
      `Reconciliação bloqueada: o campo de data de compra tem de ser 334 (configurado: ${configurado})`
    )
  }
}

async function resolverUserIdsOgiAtivos(): Promise<unknown[]> {
  const produtoOgi = await Product.findOne({
    platform: 'hotmart',
    isActive: true,
    $or: [{ code: /^OGI/i }, { courseCode: /^OGI/i }, { name: /Grande Investimento/i }]
  })
    .select('_id')
    .lean()
    .exec() as { _id?: unknown } | null

  if (!produtoOgi?._id) throw new Error('Produto OGI Hotmart activo não encontrado')

  const inscricoes = await collectCappedCursor(UserProduct.find({
    platform: 'hotmart',
    productId: produtoOgi._id,
    status: 'ACTIVE'
  })
    .select('userId')
    .sort({ _id: 1 })
    .maxTimeMS(5_000)
    .lean()
    .cursor({ batchSize: READ_BATCH_SIZE }), MAX_ACTIVE_STUDENTS, 'AC_PURCHASE_ACTIVE_ENROLLMENTS') as Array<{ userId: unknown }>

  return inscricoes.map((inscricao) => inscricao.userId)
}

/**
 * Repõe apenas o campo 334 na compra âncora do último ciclo Hotmart.
 * Por omissão limita-se a relatar; uma escrita exige `dryRun: false` explícito.
 */
export async function reconcilePurchaseDates(
  opcoes: { dryRun?: boolean } = {}
): Promise<ReconcileReport> {
  validarCampoDataCompra()
  const dryRun = opcoes.dryRun !== false
  const report: ReconcileReport = {
    verificados: 0,
    escritos: 0,
    jaCertos: 0,
    semDados: 0,
    erros: 0,
    alteracoes: []
  }

  const criarRasto = async (dados: Record<string, unknown>, tolerarDuplicado = false): Promise<CreatedWriteLog | null> => {
    try {
      mainParityLocalMutationStarted()
      return await AcWriteLog.create({ quando: new Date(), ...dados }) as unknown as CreatedWriteLog
    } catch (error) {
      if (tolerarDuplicado && erroDeChaveDuplicada(error)) return null
      throw error
    }
  }

  const reclamarEvento = async (userId: unknown, eventIdentity: string): Promise<PurchaseState | null> => {
    const agora = new Date()
    const claimToken = randomUUID()
    try {
      mainParityLocalMutationStarted()
      return await AcPurchaseDateEventState.findOneAndUpdate(
        {
          userId,
          $and: [
            {
              $or: [
                { status: { $in: ['livre', 'tratado'] } },
                { status: { $exists: false } },
                { status: 'claimado', leaseUntil: { $lte: agora } }
              ]
            },
            { eventIdentity: { $ne: eventIdentity } }
          ]
        },
        {
          $setOnInsert: { userId },
          $set: {
            status: 'claimado',
            claimToken,
            leaseUntil: new Date(agora.getTime() + CLAIM_LEASE_MS),
            claimedAt: agora,
            pendingEventIdentity: eventIdentity
          }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean().exec() as PurchaseState | null
    } catch (error) {
      if (erroDeChaveDuplicada(error)) return null
      throw error
    }
  }

  const libertarClaim = async (estado: PurchaseState): Promise<void> => {
    if (!estado?.claimToken) return
    mainParityLocalMutationStarted()
    await AcPurchaseDateEventState.findOneAndUpdate(
      {
        userId: estado.userId,
        status: { $in: ['claimado', 'confirmacao-pendente'] },
        claimToken: estado.claimToken
      },
      {
        $set: { status: estado.eventIdentity ? 'tratado' : 'livre' },
        $unset: {
          claimToken: 1,
          leaseUntil: 1,
          claimedAt: 1,
          pendingEventIdentity: 1,
          pendingValue: 1
        }
      },
      { new: true }
    ).lean().exec()
  }

  const marcarConfirmacaoPendente = async (estado: PurchaseState, pendingValue: string): Promise<PurchaseState | null> => {
    mainParityLocalMutationStarted()
    return await AcPurchaseDateEventState.findOneAndUpdate(
      { userId: estado.userId, status: 'claimado', claimToken: estado.claimToken },
      { $set: { status: 'confirmacao-pendente', pendingValue } },
      { new: true }
    ).lean().exec() as PurchaseState | null
  }

  const finalizarEvento = async (estado: PurchaseState, eventIdentity: string): Promise<PurchaseState> => {
    mainParityLocalMutationStarted()
    const finalizado = await AcPurchaseDateEventState.findOneAndUpdate(
      {
        userId: estado.userId,
        status: 'confirmacao-pendente',
        claimToken: estado.claimToken,
        pendingEventIdentity: eventIdentity
      },
      {
        $set: { status: 'tratado', eventIdentity },
        $unset: {
          claimToken: 1,
          leaseUntil: 1,
          claimedAt: 1,
          pendingEventIdentity: 1,
          pendingValue: 1
        }
      },
      { new: true }
    ).lean().exec() as PurchaseState | null
    if (!finalizado) throw new Error('Falha ao finalizar claim do campo 334')
    return finalizado
  }

  const userIdsAtivos = await resolverUserIdsOgiAtivos()
  const entradasAc: Array<{
      userId: unknown
      email: string
      contactId: string | null
      purchaseDate: Date | null
    }> = []
  for (let offset = 0; offset < userIdsAtivos.length; offset += READ_BATCH_SIZE) {
    const userIds = userIdsAtivos.slice(offset, offset + READ_BATCH_SIZE)
    entradasAc.push(...await collectCappedCursor(ACRenewalData.find({ userId: { $in: userIds } })
      .select('userId email contactId purchaseDate').sort({ _id: 1 }).maxTimeMS(5_000)
      .lean().cursor({ batchSize: READ_BATCH_SIZE }), READ_BATCH_SIZE, 'AC_PURCHASE_AC_DATA') as typeof entradasAc)
  }

  const userIds = entradasAc.map((entrada) => entrada.userId)
  const estados: PurchaseState[] = []
  const entradasHotmart: Array<{ userId: unknown; sales: VendaEntrada[] | null }> = []
  for (let offset = 0; offset < userIds.length; offset += READ_BATCH_SIZE) {
    const batchUserIds = userIds.slice(offset, offset + READ_BATCH_SIZE)
    const [stateBatch, hotmartBatch] = await Promise.all([
      collectCappedCursor(AcPurchaseDateEventState.find({ userId: { $in: batchUserIds } })
        .select('userId status eventIdentity pendingEventIdentity pendingValue claimToken leaseUntil claimedAt')
        .sort({ _id: 1 }).maxTimeMS(5_000).lean().cursor({ batchSize: READ_BATCH_SIZE }), READ_BATCH_SIZE, 'AC_PURCHASE_STATES') as Promise<PurchaseState[]>,
      collectCappedCursor(HotmartSaleHistory.find({ userId: { $in: batchUserIds } })
        .select('userId sales').sort({ _id: 1 }).maxTimeMS(5_000)
        .lean().cursor({ batchSize: READ_BATCH_SIZE }), READ_BATCH_SIZE, 'AC_PURCHASE_HOTMART') as Promise<Array<{ userId: unknown; sales: VendaEntrada[] | null }>>,
    ])
    estados.push(...stateBatch)
    entradasHotmart.push(...hotmartBatch)
  }
  const estadoByUserId = new Map(estados.map((estado) => [String(estado.userId), estado]))

  const vendasPorAluno = new Map<string, VendaEntrada[]>()
  for (const entrada of entradasHotmart) {
    const userId = String(entrada.userId)
    vendasPorAluno.set(userId, [...(vendasPorAluno.get(userId) ?? []), ...(entrada.sales ?? [])])
  }

  for (const entrada of entradasAc) {
    report.verificados += 1
    const estadoPendente = estadoByUserId.get(String(entrada.userId))
    if (estadoPendente?.status === 'confirmacao-pendente') {
      const fotografiaConfirma = Boolean(
        entrada.purchaseDate &&
        estadoPendente.pendingValue &&
        formatarData(entrada.purchaseDate) === estadoPendente.pendingValue
      )
      if (!dryRun && fotografiaConfirma && estadoPendente.pendingEventIdentity) {
        try {
          const finalizado = await finalizarEvento(
            estadoPendente,
            estadoPendente.pendingEventIdentity
          )
          estadoByUserId.set(String(entrada.userId), finalizado)
          report.jaCertos += 1
        } catch {
          report.erros += 1
        }
      }
      continue
    }

    const ultimoCiclo = agruparCiclos(vendasPorAluno.get(String(entrada.userId)) ?? [])
      .filter((c) => c.compras.some((compra) => !compra.reembolsada))
      .at(-1)
    const dataReal = ultimoCiclo ? dataCompraDoCiclo(ultimoCiclo) : null

    if (!dataReal) {
      report.semDados += 1
      try {
        const antes = entrada.purchaseDate ? formatarData(entrada.purchaseDate) : null
        await criarRasto({
          servico: 'dataCompra',
          email: entrada.email,
          campo: CAMPO_DATA_COMPRA_AC,
          antes,
          depois: null,
          accao: 'recusado',
          motivo: 'semVenda',
          dryRun,
          idempotencyKey: chaveIdempotente(['dataCompra', String(entrada.userId), antes, null, 'semVenda', dryRun])
        }, true)
      } catch {
        report.erros += 1
      }
      continue
    }

    if (!entrada.contactId) {
      report.semDados += 1
      try {
        const antes = entrada.purchaseDate ? formatarData(entrada.purchaseDate) : null
        const depois = formatarData(dataReal)
        await criarRasto({
          servico: 'dataCompra',
          email: entrada.email,
          campo: CAMPO_DATA_COMPRA_AC,
          antes,
          depois,
          accao: 'recusado',
          motivo: 'semContacto',
          dryRun,
          idempotencyKey: chaveIdempotente(['dataCompra', String(entrada.userId), antes, depois, 'semContacto', dryRun])
        }, true)
      } catch {
        report.erros += 1
      }
      continue
    }

    if (
      entrada.purchaseDate &&
      Math.abs(entrada.purchaseDate.getTime() - dataReal.getTime()) <= VINTE_QUATRO_HORAS_MS
    ) {
      report.jaCertos += 1
      continue
    }

    const alteracao = {
      email: entrada.email,
      antes: entrada.purchaseDate ? formatarData(entrada.purchaseDate) : null,
      depois: formatarData(dataReal)
    }
    report.alteracoes.push(alteracao)

    const eventIdentity = chaveIdempotente([alteracao.antes, alteracao.depois])
    if (dryRun) {
      try {
        await criarRasto({
          servico: 'dataCompra',
          email: entrada.email,
          campo: CAMPO_DATA_COMPRA_AC,
          antes: alteracao.antes,
          depois: alteracao.depois,
          accao: 'escrito',
          dryRun,
          idempotencyKey: chaveIdempotente(['dataCompra', String(entrada.userId), eventIdentity, 'proposta', dryRun])
        }, true)
      } catch {
        report.erros += 1
      }
      continue
    }

    let claim: PurchaseState | null
    try {
      claim = await reclamarEvento(entrada.userId, eventIdentity)
    } catch {
      report.erros += 1
      continue
    }
    if (!claim) continue

    let rasto: CreatedWriteLog | null
    try {
      rasto = await criarRasto({
        servico: 'dataCompra',
        email: entrada.email,
        campo: CAMPO_DATA_COMPRA_AC,
        antes: alteracao.antes,
        depois: alteracao.depois,
        accao: 'escrito',
        dryRun,
        idempotencyKey: chaveIdempotente(['dataCompra', String(entrada.userId), eventIdentity, 'tentativa', claim.claimToken])
      })
    } catch {
      report.erros += 1
      try {
        await libertarClaim(claim)
      } catch {
        report.erros += 1
      }
      continue
    }
    if (!rasto) {
      report.erros += 1
      await libertarClaim(claim)
      continue
    }

    let confirmado: PurchaseState | null
    try {
      confirmado = await marcarConfirmacaoPendente(claim, alteracao.depois)
      if (!confirmado) throw new Error('Falha ao persistir confirmação pendente do campo 334')
      estadoByUserId.set(String(entrada.userId), confirmado)
    } catch {
      report.erros += 1
      try {
        mainParityLocalMutationStarted()
        await AcWriteLog.findByIdAndUpdate(rasto._id, {
          $set: { accao: 'recusado', motivo: 'falhaInterna' }
        })
      } catch {
        // A intenção prévia continua a preservar a tentativa bloqueada.
      }
      try {
        await libertarClaim(claim)
      } catch {
        report.erros += 1
      }
      continue
    }

    let escrito: boolean
    try {
      mainParityProviderStarted()
      escrito = await activeCampaignService.updateContactField(
        entrada.email,
        CAMPO_DATA_COMPRA_AC,
        alteracao.depois
      )
      if (escrito) mainParityProviderSucceeded()
    } catch {
      report.erros += 1
      try {
        mainParityLocalMutationStarted()
        await AcWriteLog.findByIdAndUpdate(rasto._id, {
          $set: { accao: 'recusado', motivo: 'falhaExterna' }
        })
      } catch {
        // A intenção criada antes da chamada continua a preservar a tentativa.
      }
      try {
        await libertarClaim(confirmado)
      } catch {
        report.erros += 1
      }
      continue
    }

    if (!escrito) {
      report.erros += 1
      try {
        mainParityLocalMutationStarted()
        await AcWriteLog.findByIdAndUpdate(rasto._id, {
          $set: { accao: 'recusado', motivo: 'falhaExterna' }
        })
      } catch {
        // A intenção criada antes da chamada continua a preservar a tentativa.
      }
      try {
        await libertarClaim(confirmado)
      } catch {
        report.erros += 1
      }
      continue
    }

    report.escritos += 1
    try {
      const finalizado = await finalizarEvento(confirmado, eventIdentity)
      estadoByUserId.set(String(entrada.userId), finalizado)
    } catch {
      // O sucesso externo fica auditado; o claim impede uma repetição cega.
      report.erros += 1
    }
  }

  return report
}

export default reconcilePurchaseDates
