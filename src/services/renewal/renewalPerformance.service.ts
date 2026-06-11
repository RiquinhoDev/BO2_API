// ════════════════════════════════════════════════════════════
// src/services/renewal/renewalPerformance.service.ts
// Taxa de renovação por turma, SEPARADA POR ANO (tab "Desempenho").
//
// Para um ano Y (ex 2026), o ciclo de renovação desse ano é:
//   anterior = cohorts cujo ACESSO expira em Y          (quem tem de renovar em Y)
//   nova     = cohorts cujo PERÍODO começa em Y (YY=Y)  (a renovação vendida em Y)
//
//   base      = anterior + nova
//   renovados = nova        (migração de cohort)
//   vendas    = salesCount da oferta cujo período começa em Y (double-check via link)
//   taxa      = max(renovados, vendas) / base   ·   meta 20%
//
// Só o ano escolhido — renovações de 2024/25 já não interessam.
// ════════════════════════════════════════════════════════════

import RenewalOffer from '../../models/RenewalOffer'
import User from '../../models/user'
import { parseOfferName, parseTurmaName } from './turmaParser'

type AggregateModel = { aggregate: (...args: any[]) => any }
const UserAgg = User as unknown as AggregateModel

export const RENEWAL_TARGET = 0.2 // 20% — meta de comissão

export interface RenewalPerformance {
  turmaNumber: number
  className: string | null // cohort a expirar (anterior)
  novaClassName: string | null // cohort novo (renovados)
  alunos: number // base = anterior + nova
  renovados: number
  vendas: number
  taxa: number
  vsMeta: number
  expiry: string | null // expiração do cohort anterior
}

export interface RenewalPerformanceResponse {
  target: number
  year: number
  availableYears: number[]
  turmas: RenewalPerformance[]
  totals: { vendas: number; alunos: number; taxaMedia: number; acimaMeta: number }
}

interface Cohort {
  className: string
  count: number
  periodYY: string // 2 primeiros dígitos do período (ano)
  expiry: Date | null
}

export async function getRenewalPerformance(year?: number): Promise<RenewalPerformanceResponse> {
  const now = new Date()
  const Y = year || now.getUTCFullYear()
  const yy = String(Y % 100).padStart(2, '0')

  // 1. cohorts por turma
  const rows = (await UserAgg.aggregate([
    { $unwind: '$hotmart.enrolledClasses' },
    { $match: { 'hotmart.enrolledClasses.isActive': { $ne: false } } },
    { $group: { _id: '$hotmart.enrolledClasses.className', n: { $sum: 1 } } }
  ])) as Array<{ _id: string; n: number }>

  const byTurma = new Map<number, Cohort[]>()
  const years = new Set<number>()
  for (const r of rows) {
    const p = parseTurmaName(r._id || '')
    if (p.turmaNumber === null || !p.periodYYMM) continue
    if (p.accessEndOgi) years.add(p.accessEndOgi.getUTCFullYear())
    const arr = byTurma.get(p.turmaNumber) || []
    arr.push({ className: r._id, count: r.n, periodYY: p.periodYYMM.slice(0, 2), expiry: p.accessEndOgi })
    byTurma.set(p.turmaNumber, arr)
  }
  const availableYears = [...years].sort((a, b) => a - b)

  // 2. vendas por (turma, anoDoPeríodo) — ofertas de renovação, inclui inactivas
  const offers = await RenewalOffer.find({})
    .select('turmaNumbers offerName periodYYMM salesCount isRenewal')
    .lean()
    .exec() as Array<{ turmaNumbers?: number[]; offerName?: string; periodYYMM?: string | null; salesCount?: number; isRenewal?: boolean }>

  const vendasByTurmaYY = new Map<string, number>()
  for (const o of offers) {
    const parsed = parseOfferName(o.offerName || '')
    const isRen = o.isRenewal || parsed.isRenewal || /renova/i.test(o.offerName || '')
    if (!isRen) continue
    const period = o.periodYYMM || parsed.periodYYMM
    if (!period) continue
    const offerYY = period.slice(0, 2)
    const assigned = (o.turmaNumbers || []).filter((n) => n > 0)
    const turmas = assigned.length > 0 ? assigned : parsed.turmaNumbers
    for (const t of turmas) {
      const key = `${t}_${offerYY}`
      vendasByTurmaYY.set(key, (vendasByTurmaYY.get(key) || 0) + (o.salesCount || 0))
    }
  }

  const turmas: RenewalPerformance[] = []
  for (const [turmaNumber, cohorts] of byTurma) {
    const anterior = cohorts.filter((c) => c.expiry && c.expiry.getUTCFullYear() === Y)
    if (anterior.length === 0) continue // esta turma não tem ninguém a expirar em Y
    const nova = cohorts.filter((c) => c.periodYY === yy)

    const anteriorN = anterior.reduce((s, c) => s + c.count, 0)
    const novaN = nova.reduce((s, c) => s + c.count, 0)
    const base = anteriorN + novaN
    const vendas = vendasByTurmaYY.get(`${turmaNumber}_${yy}`) || 0
    const renovacoes = Math.max(novaN, vendas)
    const taxa = base > 0 ? renovacoes / base : 0

    const reprAnterior = anterior.slice().sort((a, b) => b.count - a.count)[0]
    const reprNova = nova.slice().sort((a, b) => b.count - a.count)[0]

    turmas.push({
      turmaNumber,
      className: reprAnterior?.className ?? null,
      novaClassName: reprNova?.className ?? null,
      alunos: base,
      renovados: novaN,
      vendas,
      taxa,
      vsMeta: taxa - RENEWAL_TARGET,
      expiry: reprAnterior?.expiry ? reprAnterior.expiry.toISOString() : null
    })
  }

  turmas.sort((a, b) => (a.expiry || '').localeCompare(b.expiry || '') || a.turmaNumber - b.turmaNumber)

  const totalVendas = turmas.reduce((s, t) => s + t.vendas, 0)
  const totalBase = turmas.reduce((s, t) => s + t.alunos, 0)
  const totalRenov = turmas.reduce((s, t) => s + Math.max(t.renovados, t.vendas), 0)
  const acimaMeta = turmas.filter((t) => t.taxa >= RENEWAL_TARGET).length

  return {
    target: RENEWAL_TARGET,
    year: Y,
    availableYears,
    turmas,
    totals: {
      vendas: totalVendas,
      alunos: totalBase,
      taxaMedia: totalBase > 0 ? totalRenov / totalBase : 0,
      acimaMeta
    }
  }
}
