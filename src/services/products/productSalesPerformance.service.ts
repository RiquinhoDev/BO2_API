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

import ProductSalesMonthlyStats, { type IProductSalesMonthlyStats } from '../../models/ProductSalesMonthlyStats'
import logger from '../../utils/logger'
import { HttpError } from '../../security/errorHandling'
import { IntegrationUnavailableError } from '../../errors/integrationUnavailableError'
import { fetchSubscriptionTransactions } from './productSalesGuruTransactions'
import { assertProviderReadBatchSize } from '../../security/providerReadBatchPolicy'
import { assertMainParityOwnership, mainParityProviderStarted, mainParityProviderSucceeded, mainParityLocalMutationStarted } from '../renewal/mainParityExecution'
import { estimateEUR } from '../../utils/currencyEstimate'
import {
  fetchAllOgiSalesGroupedByEmail,
  resolveOgiProduct,
  aggregateMonthlySalesStats,
  emptyMonthlyStat,
  type MonthlySalesStat
} from '../renewal/hotmartSalesHistory.service'
import { getHotmartAccessToken } from '../syncUtilizadoresServices/hotmartServices/hotmart.helpers'
import { fetchAllSubscriptionsPaginated } from '../guru/guruSync.service'
import { getRenewalParitySettings } from '../../config/renewalEnvironment'

// ─────────────────────────────────────────────────────────────
// PRODUTOS SUPORTADOS
// ─────────────────────────────────────────────────────────────

export const PRODUCT_KEYS = ['OGI', 'CLAREZA_MENSAL', 'CLAREZA_ANUAL'] as const
export type ProductKey = typeof PRODUCT_KEYS[number]

function clarezaGuruProductIds(): Record<'CLAREZA_MENSAL' | 'CLAREZA_ANUAL', string> {
  const settings = getRenewalParitySettings()
  if (!settings.guruClarezaMonthlyProductId || !settings.guruClarezaAnnualProductId) {
    throw new IntegrationUnavailableError('guru', 'Configure both Clareza Guru product identifiers for this environment')
  }
  return {
    CLAREZA_MENSAL: settings.guruClarezaMonthlyProductId,
    CLAREZA_ANUAL: settings.guruClarezaAnnualProductId,
  }
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
    assertMainParityOwnership()
    mainParityLocalMutationStarted()
    await ProductSalesMonthlyStats.updateOne(
      { productKey, month: stat.month },
      { $set: { ...stat, productKey, lastSyncedAt: new Date() } },
      { upsert: true }
    )
  }
}

export async function syncOgiSalesPerformance(): Promise<ProductSyncReport> {
  assertMainParityOwnership()
  mainParityProviderStarted()
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

  if ([base, refunded, chargeback].some(stream => !stream.paginationComplete)) throw new Error('Hotmart sales incomplete; monthly totals unchanged')
  mainParityProviderSucceeded()

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

const GURU_CONCURRENCY = 5
const GURU_BATCH_DELAY_MS = 300
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

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
    assertMainParityOwnership()
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
  const guruProductId = clarezaGuruProductIds()[productKey]
  const errors: string[] = []

  assertMainParityOwnership()
  mainParityProviderStarted()
  const subscriptions = await fetchAllSubscriptionsPaginated({ product_id: guruProductId }, undefined, {
    beforeRequest: assertMainParityOwnership,
  })
  assertProviderReadBatchSize(subscriptions.length, 'guru-product-sales')
  mainParityProviderSucceeded()
  logger.info(`[ProductSalesPerformance:${productKey}] ${subscriptions.length} subscrições encontradas`)

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
        // ao contrário da Hotmart, a Guru diz-nos diretamente: cycle 1 =
        // 1ª cobrança da subscrição (novo subscritor), cycle > 1 = renovação
        // recorrente. Muito mais fiável que inferir por preço.
        const isNew = tx.invoice?.cycle === 1

        let bucket = buckets.get(month)
        if (!bucket) {
          const [y, m] = month.split('-').map(Number)
          bucket = emptyMonthlyStat(month, y, m)
          buckets.set(month, bucket)
        }

        if (isRefund) {
          refundsFound += 1
          bucket.refundedCount += 1
          if (amount != null) bucket.refundedByCurrency[currency] = (bucket.refundedByCurrency[currency] || 0) + amount
          continue
        }

        salesFound += 1
        bucket.salesCount += 1
        if (amount != null) {
          bucket.revenueByCurrency[currency] = (bucket.revenueByCurrency[currency] || 0) + amount
          if (isNew) {
            bucket.newCount += 1
            bucket.newRevenueByCurrency[currency] = (bucket.newRevenueByCurrency[currency] || 0) + amount
          } else {
            bucket.recurringCount += 1
            bucket.recurringRevenueByCurrency[currency] = (bucket.recurringRevenueByCurrency[currency] || 0) + amount
          }
        }
      }
    } catch (error: unknown) {
      errors.push(`Subscrição ${sub.id}: ${error instanceof Error ? error.message : 'erro desconhecido'}`)
    }
  })

  const stats = [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month))
  if (errors.length > 0) throw new Error('Guru sales incomplete; monthly totals unchanged')
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
  clarezaGuruProductIds()
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
  newCount: number
  newRevenueByCurrency: Record<string, number>
  recurringCount: number
  recurringRevenueByCurrency: Record<string, number>
  refundedCount: number
  refundedByCurrency: Record<string, number>
  estimatedRevenueEUR: number
  estimatedNewRevenueEUR: number
  estimatedRecurringRevenueEUR: number
  lastSyncedAt: string
}

export interface ProductSalesTotals {
  salesCount: number
  revenueByCurrency: Record<string, number>
  newCount: number
  newRevenueByCurrency: Record<string, number>
  recurringCount: number
  recurringRevenueByCurrency: Record<string, number>
  refundedCount: number
  refundedByCurrency: Record<string, number>
  estimatedTotalEUR: number
  estimatedNewRevenueEUR: number
  estimatedRecurringRevenueEUR: number
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

function sumByCurrency(target: Record<string, number>, source: Record<string, number>): void {
  for (const [cur, val] of Object.entries(source)) target[cur] = (target[cur] || 0) + val
}

function toTotals(months: ProductSalesMonth[]): ProductSalesTotals {
  const raw = months.reduce(
    (acc, m) => {
      acc.salesCount += m.salesCount
      acc.newCount += m.newCount
      acc.recurringCount += m.recurringCount
      acc.refundedCount += m.refundedCount
      sumByCurrency(acc.revenueByCurrency, m.revenueByCurrency)
      sumByCurrency(acc.newRevenueByCurrency, m.newRevenueByCurrency)
      sumByCurrency(acc.recurringRevenueByCurrency, m.recurringRevenueByCurrency)
      sumByCurrency(acc.refundedByCurrency, m.refundedByCurrency)
      return acc
    },
    {
      salesCount: 0, revenueByCurrency: {} as Record<string, number>,
      newCount: 0, newRevenueByCurrency: {} as Record<string, number>,
      recurringCount: 0, recurringRevenueByCurrency: {} as Record<string, number>,
      refundedCount: 0, refundedByCurrency: {} as Record<string, number>
    }
  )
  const est = estimateEUR(raw.revenueByCurrency)
  const newEst = estimateEUR(raw.newRevenueByCurrency)
  const recurringEst = estimateEUR(raw.recurringRevenueByCurrency)
  return {
    ...raw,
    estimatedTotalEUR: est.estimatedTotalEUR,
    estimatedNewRevenueEUR: newEst.estimatedTotalEUR,
    estimatedRecurringRevenueEUR: recurringEst.estimatedTotalEUR,
    unconvertedCurrencies: est.unconvertedCurrencies
  }
}

export async function getProductSalesPerformance(year?: number): Promise<ProductSalesPerformanceResponse> {
  if (year !== undefined && (!Number.isInteger(year) || year < 1900 || year > 2100)) {
    throw new HttpError({ status: 400, code: 'PRODUCT_SALES_YEAR_INVALID', publicMessage: 'Ano inválido' })
  }
  const allYearsFilter = { productKey: { $in: [...PRODUCT_KEYS] }, year: { $gte: 1900, $lte: 2100 } }
  const availableYears = (await ProductSalesMonthlyStats.distinct('year', allYearsFilter).maxTimeMS(5000).exec() as number[]).sort((a, b) => a - b)
  const query = { ...allYearsFilter, ...(year === undefined ? {} : { year }) }
  const rawDocs: IProductSalesMonthlyStats[] = []
  const cursor = ProductSalesMonthlyStats.find(query).sort({ productKey: 1, month: 1, _id: 1 })
    .maxTimeMS(5000).lean<IProductSalesMonthlyStats[]>().cursor({ batchSize: 200 })
  try {
    for await (const doc of cursor) {
      if (rawDocs.length >= 3 * 12 * 201) throw new Error('Product monthly history exceeds finite supported horizon')
      rawDocs.push(doc)
    }
  } finally {
    await cursor.close()
  }

  const products: ProductSalesBlock[] = PRODUCT_KEYS.map((productKey) => {
    const months: ProductSalesMonth[] = rawDocs
      .filter((d) => d.productKey === productKey)
      .map((d) => ({
        ...d,
        lastSyncedAt: new Date(d.lastSyncedAt).toISOString(),
        newCount: d.newCount || 0,
        newRevenueByCurrency: d.newRevenueByCurrency || {},
        recurringCount: d.recurringCount || 0,
        recurringRevenueByCurrency: d.recurringRevenueByCurrency || {},
        estimatedRevenueEUR: estimateEUR(d.revenueByCurrency || {}).estimatedTotalEUR,
        estimatedNewRevenueEUR: estimateEUR(d.newRevenueByCurrency || {}).estimatedTotalEUR,
        estimatedRecurringRevenueEUR: estimateEUR(d.recurringRevenueByCurrency || {}).estimatedTotalEUR
      }))
    return { productKey, label: PRODUCT_LABELS[productKey], months, totals: toTotals(months) }
  })

  const combinedMonths = products.flatMap((p) => p.months)
  const combined = toTotals(combinedMonths)

  return { year: year || null, availableYears, combined, products }
}

export default getProductSalesPerformance
