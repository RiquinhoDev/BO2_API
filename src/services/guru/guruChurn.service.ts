// src/services/guru/guruChurn.service.ts
// Churn mensal calculado DIRETAMENTE das subscrições da Guru — sem snapshots, sem escrita na BD.
//
// Mesma lógica de classificação por datas que os snapshots históricos usavam
// (guru.snapshot.controller.ts): uma subscrição conta para a base de um mês se
// started_at < início do mês E (sem cancelamento OU cancelled_at >= início do mês).
// Como cada subscrição da Guru traz o ciclo de vida completo (started_at / cancelled_at),
// a série mensal inteira é recalculável a qualquer momento a partir de um único fetch.
//
// Separa as 2 modalidades de pagamento (mensal vs anual via charged_every_days) porque
// misturar as duas numa taxa mensal única distorce: um assinante anual não "pode churnar"
// todos os meses — a decisão dele concentra-se na renovação.

// ─────────────────────────────────────────────────────────────
// HELPERS DE DATA (a API Guru devolve Unix timestamp em segundos ou ISO string,
// e as datas podem vir no nível raiz ou dentro de dates.*)
// ─────────────────────────────────────────────────────────────

function parseGuruDate(value: any): Date | null {
  if (!value) return null
  if (typeof value === 'number') {
    return new Date(value * 1000) // Unix timestamp em segundos
  }
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function getStartedAt(sub: any): Date | null {
  return parseGuruDate(sub.started_at || sub.dates?.started_at)
}

function getCanceledAt(sub: any): Date | null {
  return parseGuruDate(
    sub.cancelled_at || sub.canceled_at || sub.dates?.canceled_at || sub.dates?.cancelled_at
  )
}

/** Mensal ≈ 30 dias, anual ≥ 300 dias (algumas plataformas usam 360/365) */
function isAnnualPlan(chargedEveryDays?: number): boolean {
  if (!chargedEveryDays) return false
  return chargedEveryDays >= 300
}

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

export interface ChurnPlanMonth {
  baseAtStart: number
  canceled: number
  churnRate: number
}

export interface ChurnMonth {
  year: number
  month: number // 1-12
  monthName: string
  baseAtStart: number
  newSubscriptions: number
  lostSubscriptions: number
  churnRate: number
  retentionRate: number
  activeAtEnd: number
  isCurrentMonth: boolean
  byPlanType: {
    monthly: ChurnPlanMonth
    annual: ChurnPlanMonth
  }
}

export interface ChurnSeries {
  average: number // blended (todas as modalidades juntas)
  averageMonthlyPlans: number // só planos mensais
  averageAnnualPlans: number // só planos anuais
  months: ChurnMonth[]
  period: string | null
  totalSubscriptions: number
}

// ─────────────────────────────────────────────────────────────
// CÁLCULO
// ─────────────────────────────────────────────────────────────

export function computeChurnSeries(allSubscriptions: any[]): ChurnSeries {
  // Normalizar uma vez (descartar subscrições sem data de início — não classificáveis)
  const subs = allSubscriptions
    .map(sub => ({
      started: getStartedAt(sub),
      canceled: getCanceledAt(sub),
      annual: isAnnualPlan(sub.charged_every_days)
    }))
    .filter((s): s is { started: Date; canceled: Date | null; annual: boolean } => s.started !== null)

  if (subs.length === 0) {
    return {
      average: 0,
      averageMonthlyPlans: 0,
      averageAnnualPlans: 0,
      months: [],
      period: null,
      totalSubscriptions: 0
    }
  }

  // Primeira subscrição = início da série
  let earliest = subs[0].started
  for (const s of subs) {
    if (s.started < earliest) earliest = s.started
  }

  const now = new Date()
  const months: ChurnMonth[] = []
  let cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  while (cursor <= lastMonthStart) {
    const monthStart = cursor
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999)

    let baseAtStart = 0
    let newThisMonth = 0
    let canceledThisMonth = 0
    let activeAtEnd = 0
    const plan = {
      monthly: { baseAtStart: 0, canceled: 0 },
      annual: { baseAtStart: 0, canceled: 0 }
    }

    for (const s of subs) {
      const bucket = s.annual ? plan.annual : plan.monthly

      if (s.started < monthStart && (!s.canceled || s.canceled >= monthStart)) {
        baseAtStart++
        bucket.baseAtStart++
      }
      if (s.started >= monthStart && s.started <= monthEnd) {
        newThisMonth++
      }
      if (s.canceled && s.canceled >= monthStart && s.canceled <= monthEnd) {
        canceledThisMonth++
        bucket.canceled++
      }
      if (s.started <= monthEnd && (!s.canceled || s.canceled > monthEnd)) {
        activeAtEnd++
      }
    }

    // Sem base nem entradas = mês vazio antes do arranque real — não entra na série
    if (baseAtStart === 0 && newThisMonth === 0) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      continue
    }

    const rate = (lost: number, base: number) =>
      base > 0 ? parseFloat(((lost / base) * 100).toFixed(2)) : 0

    // Primeiro mês (base 0 mas com novas): churn sobre as novas, como faziam os snapshots
    const churnRate = baseAtStart > 0
      ? rate(canceledThisMonth, baseAtStart)
      : rate(canceledThisMonth, newThisMonth)

    months.push({
      year: monthStart.getFullYear(),
      month: monthStart.getMonth() + 1,
      monthName: monthStart.toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' }),
      baseAtStart,
      newSubscriptions: newThisMonth,
      lostSubscriptions: canceledThisMonth,
      churnRate,
      retentionRate: parseFloat((100 - churnRate).toFixed(2)),
      activeAtEnd,
      isCurrentMonth:
        monthStart.getFullYear() === now.getFullYear() && monthStart.getMonth() === now.getMonth(),
      byPlanType: {
        monthly: { ...plan.monthly, churnRate: rate(plan.monthly.canceled, plan.monthly.baseAtStart) },
        annual: { ...plan.annual, churnRate: rate(plan.annual.canceled, plan.annual.baseAtStart) }
      }
    })

    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }

  const avg = (values: number[]) =>
    values.length > 0
      ? parseFloat((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2))
      : 0

  const validMonths = months.filter(m => m.baseAtStart > 0)
  const validMonthly = months.filter(m => m.byPlanType.monthly.baseAtStart > 0)
  const validAnnual = months.filter(m => m.byPlanType.annual.baseAtStart > 0)

  return {
    average: avg(validMonths.map(m => m.churnRate)),
    averageMonthlyPlans: avg(validMonthly.map(m => m.byPlanType.monthly.churnRate)),
    averageAnnualPlans: avg(validAnnual.map(m => m.byPlanType.annual.churnRate)),
    months,
    period:
      months.length > 0
        ? `${months[0].month}/${months[0].year} - ${months[months.length - 1].month}/${months[months.length - 1].year}`
        : null,
    totalSubscriptions: subs.length
  }
}
