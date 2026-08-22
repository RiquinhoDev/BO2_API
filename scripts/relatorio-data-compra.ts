import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import mongoose from 'mongoose'
import ACRenewalData from '../src/models/ACRenewalData'
import HotmartSaleHistory from '../src/models/HotmartSaleHistory'
import { agruparCiclos } from '../src/services/renewal/renewalCycles'
import type { VendaEntrada } from '../src/services/renewal/renewalTimeline.types'

const DATA_CARIMBO = '2026-08-07'
const CAMINHO_RELATORIO = resolve('.superpowers/sdd/relatorio-data-compra-2026-08-22.csv')

export interface EntradaAcRelatorioDataCompra {
  userId: unknown
  email: string
  purchaseDate: Date | null
  firstPurchaseDate: Date | null
}

export interface EntradaHotmartRelatorioDataCompra {
  userId: unknown
  sales: VendaEntrada[] | null
}

export interface LinhaRelatorioDataCompra {
  email: string
  ac_334_data_compra: string
  hotmart_ultima_cobranca: string
  hotmart_primeira_cobranca_ultimo_ciclo: string
  carimbo_2026_08_07: 'sim' | 'não'
  ac_337_primeira_compra: string
  hotmart_primeira_compra_real: string
}

const COLUNAS_CSV: Array<keyof LinhaRelatorioDataCompra> = [
  'email',
  'ac_334_data_compra',
  'hotmart_ultima_cobranca',
  'hotmart_primeira_cobranca_ultimo_ciclo',
  'carimbo_2026_08_07',
  'ac_337_primeira_compra',
  'hotmart_primeira_compra_real'
]

type ModeloLeitura = { find: (...args: any[]) => any }
const ACRenewalDataLeitura = ACRenewalData as unknown as ModeloLeitura
const HotmartSaleHistoryLeitura = HotmartSaleHistory as unknown as ModeloLeitura

function mesmoDiaUtc(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

function paraIso(data: Date | null | undefined): string {
  return data ? data.toISOString() : ''
}

function eCarimbo(data: Date | null): boolean {
  return data !== null && data.toISOString().slice(0, 10) === DATA_CARIMBO
}

/**
 * Constrói as divergências sem consultar nem alterar qualquer fonte externa.
 * A última cobrança é a última compra do último ciclo; a primeira compra
 * desse ciclo continua exposta para distinguir prestações de renovações.
 */
export function construirLinhasRelatorioDataCompra(
  entradasAc: EntradaAcRelatorioDataCompra[],
  entradasHotmart: EntradaHotmartRelatorioDataCompra[]
): LinhaRelatorioDataCompra[] {
  const vendasPorAluno = new Map<string, VendaEntrada[]>()
  for (const entrada of entradasHotmart) {
    const chave = String(entrada.userId)
    const existentes = vendasPorAluno.get(chave) ?? []
    existentes.push(...(entrada.sales ?? []))
    vendasPorAluno.set(chave, existentes)
  }

  const linhas: LinhaRelatorioDataCompra[] = []
  for (const ac of entradasAc) {
    const ciclos = agruparCiclos(vendasPorAluno.get(String(ac.userId)) ?? [])
    const primeiroCiclo = ciclos[0]
    const ultimoCiclo = ciclos.at(-1)
    const primeiraCompraUltimoCiclo = ultimoCiclo?.compras[0]?.data
    const ultimaCobranca = ultimoCiclo?.compras.at(-1)?.data

    if (!primeiroCiclo || !primeiraCompraUltimoCiclo || !ultimaCobranca) continue
    if (ac.purchaseDate && mesmoDiaUtc(ac.purchaseDate, ultimaCobranca)) continue

    linhas.push({
      email: ac.email,
      ac_334_data_compra: paraIso(ac.purchaseDate),
      hotmart_ultima_cobranca: paraIso(ultimaCobranca),
      hotmart_primeira_cobranca_ultimo_ciclo: paraIso(primeiraCompraUltimoCiclo),
      carimbo_2026_08_07: eCarimbo(ac.purchaseDate) ? 'sim' : 'não',
      ac_337_primeira_compra: paraIso(ac.firstPurchaseDate),
      hotmart_primeira_compra_real: paraIso(primeiroCiclo.compras[0]?.data)
    })
  }

  return linhas.sort((a, b) => {
    if (a.carimbo_2026_08_07 !== b.carimbo_2026_08_07) {
      return a.carimbo_2026_08_07 === 'sim' ? -1 : 1
    }
    return a.email.localeCompare(b.email)
  })
}

function escaparCsv(valor: string): string {
  return /[",\r\n]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor
}

/** Gera o CSV local na ordem contratada, sem escrever nada até o CLI ser chamado. */
export function gerarCsvRelatorioDataCompra(linhas: LinhaRelatorioDataCompra[]): string {
  const cabecalho = COLUNAS_CSV.join(',')
  const corpo = linhas.map((linha) => COLUNAS_CSV.map((coluna) => escaparCsv(linha[coluna])).join(','))
  return [cabecalho, ...corpo].join('\n') + '\n'
}

export async function executarRelatorioDataCompra(): Promise<{ caminho: string; totalDivergentes: number; totalCarimbo: number }> {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!mongoUri) throw new Error('MONGO_URI ou MONGODB_URI não definido')

  await mongoose.connect(mongoUri)
  try {
    const entradasAc = await ACRenewalDataLeitura.find({})
      .select('userId email purchaseDate firstPurchaseDate')
      .lean()
      .exec() as EntradaAcRelatorioDataCompra[]
    const userIds = entradasAc.map((entrada) => entrada.userId)
    const entradasHotmart = await HotmartSaleHistoryLeitura.find({ userId: { $in: userIds } })
      .select('userId sales')
      .lean()
      .exec() as EntradaHotmartRelatorioDataCompra[]
    const linhas = construirLinhasRelatorioDataCompra(entradasAc, entradasHotmart)
    const totalCarimbo = linhas.filter((linha) => linha.carimbo_2026_08_07 === 'sim').length

    await writeFile(CAMINHO_RELATORIO, gerarCsvRelatorioDataCompra(linhas), 'utf8')

    return { caminho: CAMINHO_RELATORIO, totalDivergentes: linhas.length, totalCarimbo }
  } finally {
    await mongoose.disconnect()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  void executarRelatorioDataCompra()
    .then(({ caminho, totalDivergentes, totalCarimbo }) => {
      console.log(`Relatório: ${caminho}`)
      console.log(`Total de divergentes: ${totalDivergentes}`)
      console.log(`Carimbo 2026-08-07: ${totalCarimbo}`)
    })
    .catch((erro: unknown) => {
      console.error(erro)
      process.exitCode = 1
    })
}
