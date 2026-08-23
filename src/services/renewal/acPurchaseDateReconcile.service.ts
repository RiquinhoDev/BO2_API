import ACRenewalData from '../../models/ACRenewalData'
import HotmartSaleHistory from '../../models/HotmartSaleHistory'
import Product from '../../models/product/Product'
import UserProduct from '../../models/UserProduct'
import { activeCampaignService } from '../activeCampaign/activeCampaignService'
import { AC_PURCHASE_DATE_FIELD_ID } from './acRenewalDataSync.service'
import { agruparCiclos } from './renewalCycles'
import type { VendaEntrada } from './renewalTimeline.types'

const VINTE_QUATRO_HORAS_MS = 24 * 60 * 60 * 1000

export interface ReconcileReport {
  verificados: number
  escritos: number
  jaCertos: number
  semDados: number
  erros: number
  alteracoes: Array<{ email: string; antes: string | null; depois: string }>
}

type ModeloLeitura = { find: (...args: any[]) => any; findOne?: (...args: any[]) => any }
const ACRenewalDataLeitura = ACRenewalData as unknown as ModeloLeitura
const HotmartSaleHistoryLeitura = HotmartSaleHistory as unknown as ModeloLeitura
const ProductLeitura = Product as unknown as ModeloLeitura
const UserProductLeitura = UserProduct as unknown as ModeloLeitura

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10)
}

async function resolverUserIdsOgiAtivos(): Promise<unknown[]> {
  const produtoOgi = await ProductLeitura.findOne!({
    platform: 'hotmart',
    isActive: true,
    $or: [{ code: /^OGI/i }, { courseCode: /^OGI/i }, { name: /Grande Investimento/i }]
  })
    .select('_id')
    .lean()
    .exec() as { _id?: unknown } | null

  if (!produtoOgi?._id) throw new Error('Produto OGI Hotmart activo não encontrado')

  const inscricoes = await UserProductLeitura.find({
    platform: 'hotmart',
    productId: produtoOgi._id,
    status: 'ACTIVE'
  })
    .select('userId')
    .lean()
    .exec() as Array<{ userId: unknown }>

  return inscricoes.map((inscricao) => inscricao.userId)
}

/**
 * Repõe apenas o campo 334 na compra âncora do último ciclo Hotmart.
 * Por omissão limita-se a relatar; uma escrita exige `dryRun: false` explícito.
 */
export async function reconcilePurchaseDates(
  opcoes: { dryRun?: boolean } = {}
): Promise<ReconcileReport> {
  const dryRun = opcoes.dryRun !== false
  const report: ReconcileReport = {
    verificados: 0,
    escritos: 0,
    jaCertos: 0,
    semDados: 0,
    erros: 0,
    alteracoes: []
  }

  const userIdsAtivos = await resolverUserIdsOgiAtivos()
  const entradasAc = await ACRenewalDataLeitura.find({ userId: { $in: userIdsAtivos } })
    .select('userId email contactId purchaseDate')
    .lean()
    .exec() as Array<{
      userId: unknown
      email: string
      contactId: string | null
      purchaseDate: Date | null
    }>

  const userIds = entradasAc.map((entrada) => entrada.userId)
  const entradasHotmart = await HotmartSaleHistoryLeitura.find({ userId: { $in: userIds } })
    .select('userId sales')
    .lean()
    .exec() as Array<{ userId: unknown; sales: VendaEntrada[] | null }>

  const vendasPorAluno = new Map<string, VendaEntrada[]>()
  for (const entrada of entradasHotmart) {
    const userId = String(entrada.userId)
    vendasPorAluno.set(userId, [...(vendasPorAluno.get(userId) ?? []), ...(entrada.sales ?? [])])
  }

  for (const entrada of entradasAc) {
    report.verificados += 1
    const ultimoCiclo = agruparCiclos(vendasPorAluno.get(String(entrada.userId)) ?? []).at(-1)
    const dataReal = ultimoCiclo?.compras[0]?.data

    if (!entrada.contactId || !dataReal) {
      report.semDados += 1
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

    if (dryRun) continue

    try {
      const escrito = await activeCampaignService.updateContactField(
        entrada.email,
        AC_PURCHASE_DATE_FIELD_ID,
        alteracao.depois
      )
      if (escrito) report.escritos += 1
      else report.erros += 1
    } catch {
      report.erros += 1
    }
  }

  return report
}

export default reconcilePurchaseDates
