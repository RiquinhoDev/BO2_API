// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/hotmartSalesPerformance.service.ts
// Leitura do desempenho de vendas Hotmart (OGI) por mês — lê o
// materializado em HotmartSalesMonthlyStats (sem chamar a Hotmart).
// O materializado é escrito por hotmartSalesHistory.service.ts
// (syncActiveStudentSalesHistory), como efeito colateral do Sync
// Hotmart — não precisa de cron próprio.
//
// estimatedTotalEUR: soma aproximada em EUR das moedas não-EUR, usando
// câmbios FIXOS (não em tempo real — é só uma estimativa para dar uma
// ordem de grandeza, editável via env vars FX_RATE_<MOEDA>_EUR).
// ════════════════════════════════════════════════════════════

import HotmartSalesMonthlyStats from '../../models/HotmartSalesMonthlyStats'

// câmbios aproximados fixos (unidades de EUR por 1 unidade da moeda),
// editáveis por env var sem precisar de deploy de código. Só para dar
// uma ordem de grandeza do total — não são taxas em tempo real.
const APPROX_EUR_RATE: Record<string, number> = {
  EUR: 1,
  USD: Number(process.env.FX_RATE_USD_EUR) || 0.92,
  GBP: Number(process.env.FX_RATE_GBP_EUR) || 1.17,
  CHF: Number(process.env.FX_RATE_CHF_EUR) || 1.05,
  CAD: Number(process.env.FX_RATE_CAD_EUR) || 0.68,
  BRL: Number(process.env.FX_RATE_BRL_EUR) || 0.16
}

interface EurEstimate {
  estimatedTotalEUR: number
  unconvertedCurrencies: string[]
}

function estimateEUR(byCurrency: Record<string, number>): EurEstimate {
  let total = 0
  const unconvertedCurrencies: string[] = []
  for (const [currency, amount] of Object.entries(byCurrency)) {
    const rate = APPROX_EUR_RATE[currency]
    if (rate == null) {
      unconvertedCurrencies.push(currency)
      continue
    }
    total += amount * rate
  }
  return { estimatedTotalEUR: Math.round(total * 100) / 100, unconvertedCurrencies }
}

export interface HotmartSalesPerformanceMonth {
  month: string
  year: number
  monthNum: number
  salesCount: number
  revenueByCurrency: Record<string, number>
  refundedCount: number
  refundedByCurrency: Record<string, number>
  lastSyncedAt: string
}

export interface HotmartSalesPerformanceMonthWithEstimate extends HotmartSalesPerformanceMonth {
  estimatedRevenueEUR: number
}

export interface HotmartSalesPerformanceResponse {
  year: number | null
  months: HotmartSalesPerformanceMonthWithEstimate[]
  availableYears: number[]
  totals: {
    salesCount: number
    revenueByCurrency: Record<string, number>
    refundedCount: number
    refundedByCurrency: Record<string, number>
    estimatedTotalEUR: number
    unconvertedCurrencies: string[]
  }
}

type LeanModel = { find: (...args: any[]) => any }
const StatsReadModel = HotmartSalesMonthlyStats as unknown as LeanModel

export async function getHotmartSalesPerformance(year?: number): Promise<HotmartSalesPerformanceResponse> {
  const allDocs = await StatsReadModel.find({}).select('year').lean().exec() as Array<{ year: number }>
  const availableYears = [...new Set(allDocs.map((d) => d.year))].sort((a, b) => a - b)

  const query: Record<string, unknown> = {}
  if (year) query.year = year

  const rawMonths = await StatsReadModel.find(query)
    .sort({ month: 1 })
    .lean()
    .exec() as HotmartSalesPerformanceMonth[]

  const months: HotmartSalesPerformanceMonthWithEstimate[] = rawMonths.map((m) => ({
    ...m,
    estimatedRevenueEUR: estimateEUR(m.revenueByCurrency || {}).estimatedTotalEUR
  }))

  const rawTotals = months.reduce(
    (acc, m) => {
      acc.salesCount += m.salesCount
      acc.refundedCount += m.refundedCount
      for (const [cur, val] of Object.entries(m.revenueByCurrency || {})) {
        acc.revenueByCurrency[cur] = (acc.revenueByCurrency[cur] || 0) + val
      }
      for (const [cur, val] of Object.entries(m.refundedByCurrency || {})) {
        acc.refundedByCurrency[cur] = (acc.refundedByCurrency[cur] || 0) + val
      }
      return acc
    },
    { salesCount: 0, revenueByCurrency: {} as Record<string, number>, refundedCount: 0, refundedByCurrency: {} as Record<string, number> }
  )

  const eurEstimate = estimateEUR(rawTotals.revenueByCurrency)

  return {
    year: year || null,
    months,
    availableYears,
    totals: {
      ...rawTotals,
      estimatedTotalEUR: eurEstimate.estimatedTotalEUR,
      unconvertedCurrencies: eurEstimate.unconvertedCurrencies
    }
  }
}

export default getHotmartSalesPerformance
