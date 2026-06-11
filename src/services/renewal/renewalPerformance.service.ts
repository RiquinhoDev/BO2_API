// ════════════════════════════════════════════════════════════
// src/services/renewal/renewalPerformance.service.ts
// Taxa de renovação por turma (tab "Desempenho" do BO) — só o ÚLTIMO ciclo.
//
// Cada turma tem cohorts por período (YYMM). O ciclo mais recente compara o
// cohort NOVO (período mais alto) com o ANTERIOR (período seguinte mais alto):
//   ex turma 6:  «| 2607» (nova) vs «| 2507» (anterior)
//
//   base      = anterior + nova       (quem podia renovar neste ciclo)
//   renovados = nova                  (migração: já mudaram de cohort)
//   vendas    = salesCount da oferta cujo período = o da nova (double-check via link)
//   renovacoes = max(renovados, vendas)   ← melhor sinal (migração lenta vs vendas)
//   taxa      = renovacoes / base    ·   meta 20%
//
// Só o último ciclo porque a 1ª renovação foi há anos — não faz sentido somar tudo.
// ════════════════════════════════════════════════════════════

import RenewalOffer from '../../models/RenewalOffer'
import User from '../../models/user'
import { parseOfferName, parseTurmaName } from './turmaParser'

type AggregateModel = { aggregate: (...args: any[]) => any }
const UserAgg = User as unknown as AggregateModel

export const RENEWAL_TARGET = 0.2 // 20% — meta de comissão

export interface RenewalPerformance {
  turmaNumber: number
  className: string | null // cohort anterior (o que está a renovar)
  novaClassName: string | null // cohort novo (renovados)
  alunos: number // base = anterior + nova
  renovados: number // nova (migração)
  vendas: number // double-check via link (salesCount da oferta do período novo)
  taxa: number // max(renovados, vendas) / base
  vsMeta: number
  nextExpiry: string | null
  renewsThisYear: boolean
}

export interface RenewalPerformanceResponse {
  target: number
  turmas: RenewalPerformance[]
  totals: { vendas: number; alunos: number; taxaMedia: number; acimaMeta: number }
}

interface PeriodGroup {
  period: string // YYMM
  count: number
  className: string
  expiry: Date | null
}

export async function getRenewalPerformance(): Promise<RenewalPerformanceResponse> {
  const now = new Date()
  const currentYear = now.getUTCFullYear()
  const cutoff = new Date(Date.UTC(currentYear, now.getUTCMonth(), 1))

  // 1. cohorts por turma, agrupados por período (YYMM)
  const rows = (await UserAgg.aggregate([
    { $unwind: '$hotmart.enrolledClasses' },
    { $match: { 'hotmart.enrolledClasses.isActive': { $ne: false } } },
    { $group: { _id: '$hotmart.enrolledClasses.className', n: { $sum: 1 } } }
  ])) as Array<{ _id: string; n: number }>

  // turma → (período → grupo)
  const byTurma = new Map<number, Map<string, PeriodGroup>>()
  for (const r of rows) {
    const p = parseTurmaName(r._id || '')
    if (p.turmaNumber === null || !p.periodYYMM) continue
    const periods = byTurma.get(p.turmaNumber) || new Map<string, PeriodGroup>()
    const g = periods.get(p.periodYYMM) || { period: p.periodYYMM, count: 0, className: r._id, expiry: p.accessEndOgi }
    g.count += r.n
    // mantém o className com mais alunos como representativo do período
    periods.set(p.periodYYMM, g)
    byTurma.set(p.turmaNumber, periods)
  }

  // 2. vendas por (turma, período) — ofertas de renovação, inclui inactivas
  const offers = await RenewalOffer.find({})
    .select('turmaNumbers offerName periodYYMM salesCount isRenewal')
    .lean()
    .exec() as Array<{ turmaNumbers?: number[]; offerName?: string; periodYYMM?: string | null; salesCount?: number; isRenewal?: boolean }>

  const vendasByTurmaPeriod = new Map<string, number>()
  for (const o of offers) {
    const parsed = parseOfferName(o.offerName || '')
    const isRen = o.isRenewal || parsed.isRenewal || /renova/i.test(o.offerName || '')
    if (!isRen) continue
    const period = o.periodYYMM || parsed.periodYYMM
    if (!period) continue
    const assigned = (o.turmaNumbers || []).filter((n) => n > 0)
    const turmas = assigned.length > 0 ? assigned : parsed.turmaNumbers
    for (const t of turmas) {
      const key = `${t}_${period}`
      vendasByTurmaPeriod.set(key, (vendasByTurmaPeriod.get(key) || 0) + (o.salesCount || 0))
    }
  }

  const turmas: RenewalPerformance[] = []
  for (const [turmaNumber, periodsMap] of byTurma) {
    const periods = [...periodsMap.values()].sort((a, b) => b.period.localeCompare(a.period))
    const nova = periods[0]
    const anterior = periods[1] // pode não existir (turma só com 1 período)

    const renovados = anterior ? nova.count : 0 // sem ciclo anterior → ninguém renovou ainda
    const base = anterior ? nova.count + anterior.count : nova.count
    const vendas = vendasByTurmaPeriod.get(`${turmaNumber}_${nova.period}`) || 0
    const renovacoes = Math.max(renovados, vendas)
    const taxa = base > 0 ? renovacoes / base : 0

    // cohort a renovar = o anterior (o que está a expirar); se só há 1, é o próprio
    const expiringCohort = anterior || nova
    const expiry = expiringCohort.expiry
    const renewsThisYear = Boolean(expiry && expiry >= cutoff && expiry.getUTCFullYear() === currentYear)

    turmas.push({
      turmaNumber,
      className: expiringCohort.className,
      novaClassName: anterior ? nova.className : null,
      alunos: base,
      renovados,
      vendas,
      taxa,
      vsMeta: taxa - RENEWAL_TARGET,
      nextExpiry: expiry ? expiry.toISOString() : null,
      renewsThisYear
    })
  }

  turmas.sort((a, b) => {
    if (a.renewsThisYear !== b.renewsThisYear) return a.renewsThisYear ? -1 : 1
    if (a.renewsThisYear && b.renewsThisYear) return (a.nextExpiry || '').localeCompare(b.nextExpiry || '')
    return a.turmaNumber - b.turmaNumber
  })

  const totalVendas = turmas.reduce((s, t) => s + t.vendas, 0)
  const totalBase = turmas.reduce((s, t) => s + t.alunos, 0)
  const totalRenov = turmas.reduce((s, t) => s + Math.max(t.renovados, t.vendas), 0)
  const acimaMeta = turmas.filter((t) => t.taxa >= RENEWAL_TARGET).length

  return {
    target: RENEWAL_TARGET,
    turmas,
    totals: {
      vendas: totalVendas,
      alunos: totalBase,
      taxaMedia: totalBase > 0 ? totalRenov / totalBase : 0,
      acimaMeta
    }
  }
}
