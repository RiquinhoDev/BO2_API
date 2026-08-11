// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/hotmartSalesPerformance.service.ts
// Leitura do desempenho de vendas Hotmart (OGI) por mês — lê o
// materializado em HotmartSalesMonthlyStats (sem chamar a Hotmart).
// O materializado é escrito por hotmartSalesHistory.service.ts
// (syncActiveStudentSalesHistory), como efeito colateral do Sync
// Hotmart — não precisa de cron próprio.
// ════════════════════════════════════════════════════════════

import HotmartSalesMonthlyStats from '../../models/HotmartSalesMonthlyStats'

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

export interface HotmartSalesPerformanceResponse {
  year: number | null
  months: HotmartSalesPerformanceMonth[]
  availableYears: number[]
  totals: {
    salesCount: number
    revenueByCurrency: Record<string, number>
    refundedCount: number
    refundedByCurrency: Record<string, number>
  }
}

type LeanModel = { find: (...args: any[]) => any }
const StatsReadModel = HotmartSalesMonthlyStats as unknown as LeanModel

export async function getHotmartSalesPerformance(year?: number): Promise<HotmartSalesPerformanceResponse> {
  const allDocs = await StatsReadModel.find({}).select('year').lean().exec() as Array<{ year: number }>
  const availableYears = [...new Set(allDocs.map((d) => d.year))].sort((a, b) => a - b)

  const query: Record<string, unknown> = {}
  if (year) query.year = year

  const months = await StatsReadModel.find(query)
    .sort({ month: 1 })
    .lean()
    .exec() as HotmartSalesPerformanceMonth[]

  const totals = months.reduce(
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

  return {
    year: year || null,
    months,
    availableYears,
    totals
  }
}

export default getHotmartSalesPerformance
