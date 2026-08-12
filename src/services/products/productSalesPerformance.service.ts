// ════════════════════════════════════════════════════════════
// 📁 src/services/products/productSalesPerformance.service.ts
// Desempenho de vendas por produto e por mês — OGI (Hotmart) +
// Clareza Mensal/Anual (Guru). Escreve em ProductSalesMonthlyStats,
// um doc por (productKey, month). Leitura combinada + por produto
// para a secção "Produtos" do BO.
//
// OGI: 1 pedido em bulk à Hotmart (sales/history) + 2 filtrados
// (REFUNDED/CHARGEBACK) — reaproveita fetchAllOgiSalesGroupedByEmail
// já usado pelo Sync Hotmart (Renovações), mas corre à parte (sync
// independente, não lê/escreve HotmartSaleHistory).
//
// Clareza: a Guru não tem um "sales/history" em bulk como a Hotmart —
// a lista de subscrições nem traz valor. Só o detalhe de cada
// subscrição (GET /subscriptions/{id}/transactions) traz o histórico
// de cobranças com valor + data. Por isso o sync do Clareza é 1
// pedido por subscritor (N+1), com concorrência limitada — muito mais
// pesado que o da Hotmart. `dates.confirmed_at` (não nulo) é o sinal
// fiável de "cobrança realmente paga" — validado contra charged_times
// da subscrição.
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import ProductSalesMonthlyStats from '../../models/ProductSalesMonthlyStats'
import { estimateEUR } from '../../utils/currencyEstimate'
import {
  fetchAllOgiSalesGroupedByEmail,
  resolveOgiProduct,
  aggregateMonthlySalesStats,
  type MonthlySalesStat
} from '../renewal/hotmartSalesHistory.service'
import { getHotmartAccessToken } from '../syncUtilizadoresServices/hotmartServices/hotmart.helpers'
import { fetchAllSubscriptionsPaginated } from '../guru/guruSync.service'

// ─────────────────────────────────────────────────────────────
// PRODUTOS SUPORTADOS
// ─────────────────────────────────────────────────────────────

export const PRODUCT_KEYS = ['OGI', 'CLAREZA_MENSAL', 'CLAREZA_ANUAL'] as const
export type ProductKey = typeof PRODUCT_KEYS[number]

const CLAREZA_GURU_PRODUCT_ID: Record<'CLAREZA_MENSAL' | 'CLAREZA_ANUAL', string> = {
  CLAREZA_MENSAL: process.env.GURU_CLAREZA_MENSAL_PRODUCT_ID?.trim() || '9fa25a47-34d8-41ef-b684-0285e1c33aa4',
  CLAREZA_ANUAL: process.env.GURU_CLAREZA_ANUAL_PRODUCT_ID?.trim() || 'a002b78e-82cb-48a6-8d5d-33c8bded3d2e'
}

const PRODUCT_LABELS: Record<ProductKey, string> = {
  OGI: 'OGI',
  CLAREZA_MENSAL: 'Clareza — Mensal',
  CLAREZA_ANUAL: 'Clareza — Anual'
}

// ─────────────────────────────────────────────────────────────
// SYNC: OGI (Hotmart)
// ─────────────────────────────────────────────────────────────

export interface ProductSyncReport {
  productKey: ProductKey
  monthsUpdated: number
  salesFound: number
  refundsFound: number
  errors: string[]
}

async function saveMonthlyStats(productKey: ProductKey, stats: MonthlySalesStat[]): Promise<void> {
  for (const stat of stats) {
    await ProductSalesMonthlyStats.updateOne(
      { productKey, month: stat.month },
      { $set: { ...stat, productKey, lastSyncedAt: new Date() } },
      { upsert: true }
    )
  }
}

export async function syncOgiSalesPerformance(): Promise<ProductSyncReport> {
  const accessToken = await getHotmartAccessToken()
  const { hotmartProductId } = await resolveOgiProduct()

  const base = await fetchAllOgiSalesGroupedByEmail(accessToken, hotmartProductId)

  // a Hotmart não devolve reembolsos/chargebacks no pedido normal — só
  // com transaction_status explícito (mesmo comportamento de
  // hotmartRefunds.service.ts / hotmartSalesHistory.service.ts).
  const [refunded, chargeback] = await Promise.all([
    fetchAllOgiSalesGroupedByEmail(accessToken, hotmartProductId, 'REFUNDED'),
    fetchAllOgiSalesGroupedByEmail(accessToken, hotmartProductId, 'CHARGEBACK')
  ])

  const merged = new Map(base.salesByEmail)
  for (const extra of [refunded, chargeback]) {
    for (const [email, sales] of extra.salesByEmail) {
      const list = merged.get(email)
      if (list) merged.set(email, [...list, ...sales])
      else merged.set(email, [...sales])
    }
  }

  const stats = aggregateMonthlySalesStats(merged)
  await saveMonthlyStats('OGI', stats)

  const refundsFound = [...refunded.salesByEmail.values(), ...chargeback.salesByEmail.values()]
    .reduce((n, s) => n + s.length, 0)

  return {
    productKey: 'OGI',
    monthsUpdated: stats.length,
    salesFound: base.salesChecked,
    refundsFound,
    errors: base.paginationComplete ? [] : ['Paginação Hotmart incompleta — ver logs']
  }
}

// ─────────────────────────────────────────────────────────────
// SYNC: Clareza (Guru) — N+1, concorrência limitada
// ─────────────────────────────────────────────────────────────

const GURU_API_URL = 'https://digitalmanager.guru/api/v2'
const GURU_USER_TOKEN = process.env.GURU_USER_TOKEN
const GURU_CONCURRENCY = 5
const GURU_BATCH_DELAY_MS = 300

const guruApi = axios.create({
  baseURL: GURU_API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000
})
guruApi.interceptors.request.use((config) => {
  if (GURU_USER_TOKEN) config.headers.Authorization = `Bearer ${GURU_USER_TOKEN}`
  return config
})

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

interface GuruTransaction {
  status: string
  dates?: { confirmed_at?: number | null }
  invoice?: { value?: number; status?: string }
  payment?: { net?: number; gross?: number; total?: number; currency?: string }
}

async function fetchSubscriptionTransactions(subscriptionId: string): Promise<GuruTransaction[]> {
  const all: GuruTransaction[] = []
  let cursor: string | undefined
  let page = 0

  do {
    page += 1
    const response = await guruApi.get(`/subscriptions/${subscriptionId}/transactions`, {
      params: { per_page: 50, ...(cursor ? { cursor } : {}) }
    })
    const data: GuruTransaction[] = response.data?.data || []
    all.push(...data)

    const onLastPage = response.data?.on_last_page === 1
    const hasMorePages = response.data?.has_more_pages === 1
    const nextCursor = response.data?.next_cursor
    if (onLastPage || !hasMorePages || data.length === 0 || !nextCursor) break
    cursor = nextCursor
  } while (page < 20) // proteção — nunca vimos mais de 1 página por subscrição

  return all
}

/**
 * Processa uma lista de items em lotes com concorrência limitada — a
 * Guru não tem endpoint em bulk para isto, é 1 pedido por subscrição.
 */
async function mapWithLimitedConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
    if (i + concurrency < items.length) await sleep(GURU_BATCH_DELAY_MS)
  }
  return results
}

const REFUND_STATUS_HINTS = ['refund', 'chargeback', 'estorn']

function monthKeyFromUnix(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function syncClarezaPlanSalesPerformance(productKey: 'CLAREZA_MENSAL' | 'CLAREZA_ANUAL'): Promise<ProductSyncReport> {
  const guruProductId = CLAREZA_GURU_PRODUCT_ID[productKey]
  const errors: string[] = []

  const subscriptions = await fetchAllSubscriptionsPaginated({ product_id: guruProductId }) as Array<{ id: string }>
  console.log(`[ProductSalesPerformance:${productKey}] ${subscriptions.length} subscrições encontradas, a ir buscar transações (${GURU_CONCURRENCY} em paralelo)...`)

  const buckets = new Map<string, MonthlySalesStat>()
  let salesFound = 0
  let refundsFound = 0

  await mapWithLimitedConcurrency(subscriptions, GURU_CONCURRENCY, async (sub) => {
    try {
      const transactions = await fetchSubscriptionTransactions(sub.id)
      for (const tx of transactions) {
        const confirmedAt = tx.dates?.confirmed_at
        if (!confirmedAt) continue // não confirmado = não pago, não conta

        const isRefund = REFUND_STATUS_HINTS.some((hint) => (tx.status || '').toLowerCase().includes(hint))
        const amount = tx.invoice?.value ?? tx.payment?.net ?? tx.payment?.gross ?? null
        const currency = tx.payment?.currency || 'EUR'
        const month = monthKeyFromUnix(confirmedAt)

        let bucket = buckets.get(month)
        if (!bucket) {
          const [y, m] = month.split('-').map(Number)
          bucket = { month, year: y, monthNum: m, salesCount: 0, revenueByCurrency: {}, refundedCount: 0, refundedByCurrency: {} }
          buckets.set(month, bucket)
        }

        if (isRefund) {
          refundsFound += 1
          bucket.refundedCount += 1
          if (amount != null) bucket.refundedByCurrency[currency] = (bucket.refundedByCurrency[currency] || 0) + amount
        } else {
          salesFound += 1
          bucket.salesCount += 1
          if (amount != null) bucket.revenueByCurrency[currency] = (bucket.revenueByCurrency[currency] || 0) + amount
        }
      }
    } catch (error: any) {
      errors.push(`Subscrição ${sub.id}: ${error?.message || 'erro desconhecido'}`)
    }
  })

  const stats = [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month))
  await saveMonthlyStats(productKey, stats)

  return { productKey, monthsUpdated: stats.length, salesFound, refundsFound, errors }
}

// ─────────────────────────────────────────────────────────────
// SYNC: todos os produtos, sequencial (Hotmart primeiro, depois Guru)
// ─────────────────────────────────────────────────────────────

export interface AllProductsSyncReport {
  OGI: ProductSyncReport
  CLAREZA_MENSAL: ProductSyncReport
  CLAREZA_ANUAL: ProductSyncReport
}

export async function syncAllProductSalesPerformance(): Promise<AllProductsSyncReport> {
  const ogi = await syncOgiSalesPerformance()
  const clarezaMensal = await syncClarezaPlanSalesPerformance('CLAREZA_MENSAL')
  const clarezaAnual = await syncClarezaPlanSalesPerformance('CLAREZA_ANUAL')
  return { OGI: ogi, CLAREZA_MENSAL: clarezaMensal, CLAREZA_ANUAL: clarezaAnual }
}

// ─────────────────────────────────────────────────────────────
// LEITURA: combinado + por produto
// ─────────────────────────────────────────────────────────────

export interface ProductSalesMonth {
  month: string
  year: number
  monthNum: number
  salesCount: number
  revenueByCurrency: Record<string, number>
  refundedCount: number
  refundedByCurrency: Record<string, number>
  estimatedRevenueEUR: number
  lastSyncedAt: string
}

export interface ProductSalesTotals {
  salesCount: number
  revenueByCurrency: Record<string, number>
  refundedCount: number
  refundedByCurrency: Record<string, number>
  estimatedTotalEUR: number
  unconvertedCurrencies: string[]
}

export interface ProductSalesBlock {
  productKey: ProductKey
  label: string
  months: ProductSalesMonth[]
  totals: ProductSalesTotals
}

export interface ProductSalesPerformanceResponse {
  year: number | null
  availableYears: number[]
  combined: ProductSalesTotals
  products: ProductSalesBlock[]
}

function toTotals(months: ProductSalesMonth[]): ProductSalesTotals {
  const raw = months.reduce(
    (acc, m) => {
      acc.salesCount += m.salesCount
      acc.refundedCount += m.refundedCount
      for (const [cur, val] of Object.entries(m.revenueByCurrency)) acc.revenueByCurrency[cur] = (acc.revenueByCurrency[cur] || 0) + val
      for (const [cur, val] of Object.entries(m.refundedByCurrency)) acc.refundedByCurrency[cur] = (acc.refundedByCurrency[cur] || 0) + val
      return acc
    },
    { salesCount: 0, revenueByCurrency: {} as Record<string, number>, refundedCount: 0, refundedByCurrency: {} as Record<string, number> }
  )
  const est = estimateEUR(raw.revenueByCurrency)
  return { ...raw, estimatedTotalEUR: est.estimatedTotalEUR, unconvertedCurrencies: est.unconvertedCurrencies }
}

type LeanModel = { find: (...args: any[]) => any }
const StatsReadModel = ProductSalesMonthlyStats as unknown as LeanModel

export async function getProductSalesPerformance(year?: number): Promise<ProductSalesPerformanceResponse> {
  const allDocs = await StatsReadModel.find({}).select('year').lean().exec() as Array<{ year: number }>
  const availableYears = [...new Set(allDocs.map((d) => d.year))].sort((a, b) => a - b)

  const query: Record<string, unknown> = {}
  if (year) query.year = year

  const rawDocs = await StatsReadModel.find(query).sort({ productKey: 1, month: 1 }).lean().exec() as Array<{
    productKey: ProductKey
    month: string
    year: number
    monthNum: number
    salesCount: number
    revenueByCurrency: Record<string, number>
    refundedCount: number
    refundedByCurrency: Record<string, number>
    lastSyncedAt: string
  }>

  const products: ProductSalesBlock[] = PRODUCT_KEYS.map((productKey) => {
    const months: ProductSalesMonth[] = rawDocs
      .filter((d) => d.productKey === productKey)
      .map((d) => ({
        ...d,
        estimatedRevenueEUR: estimateEUR(d.revenueByCurrency || {}).estimatedTotalEUR
      }))
    return { productKey, label: PRODUCT_LABELS[productKey], months, totals: toTotals(months) }
  })

  const combinedMonths = products.flatMap((p) => p.months)
  const combined = toTotals(combinedMonths)

  return { year: year || null, availableYears, combined, products }
}

export default getProductSalesPerformance
