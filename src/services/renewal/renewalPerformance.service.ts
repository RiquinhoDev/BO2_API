// ════════════════════════════════════════════════════════════
// src/services/renewal/renewalPerformance.service.ts
// Taxa de renovação por turma (tab "Desempenho" do BO).
//
// Funil: cada turma é uma cadeia de cohorts por nível de renovação
//   original (0) → [renov] (1) → [2a renov] (2) → ...
//
// Para CADA turma (inclui anteriores):
//   alunos    = total de alunos da turma (todos os cohorts)
//   renovados = alunos já num nível de renovação (migração de cohort)
//   vendas    = salesCount das ofertas de renovação atribuídas à turma
//               (inclui inactivas; atribuídas por turmaNumbers ou pelo NOME da oferta)
//   renovacoes = max(renovados, vendas)  ← melhor sinal disponível, evita duplicar
//   taxa      = renovacoes / alunos   ·   meta 20% (acima = comissão)
//
// Nota: há desvio porque alguns alunos não renovam logo e são movidos mais tarde
// para um cohort com validade completa — por isso usamos o maior dos dois sinais.
// ════════════════════════════════════════════════════════════

import RenewalOffer from '../../models/RenewalOffer'
import User from '../../models/user'
import { parseOfferName, parseTurmaName } from './turmaParser'

type AggregateModel = { aggregate: (...args: any[]) => any }
const UserAgg = User as unknown as AggregateModel

export const RENEWAL_TARGET = 0.2 // 20% — meta de comissão

export interface RenewalPerformance {
  turmaNumber: number
  className: string | null // cohort representativo (a renovar agora, ou o mais recente)
  alunos: number // total de alunos da turma
  renovados: number // já num nível de renovação (migração)
  vendas: number // vendas de ofertas de renovação atribuídas (inclui inactivas)
  taxa: number // max(renovados, vendas) / alunos (0..1)
  vsMeta: number
  nextExpiry: string | null
  renewsThisYear: boolean
}

export interface RenewalPerformanceResponse {
  target: number
  turmas: RenewalPerformance[]
  totals: { vendas: number; alunos: number; taxaMedia: number; acimaMeta: number }
}

interface Cohort {
  className: string
  n: number
  level: number
  expiry: Date | null
}

export async function getRenewalPerformance(): Promise<RenewalPerformanceResponse> {
  const now = new Date()
  const currentYear = now.getUTCFullYear()
  const cutoff = new Date(Date.UTC(currentYear, now.getUTCMonth(), 1))

  // 1. cohorts (className) + nº de alunos
  const rows = (await UserAgg.aggregate([
    { $unwind: '$hotmart.enrolledClasses' },
    { $match: { 'hotmart.enrolledClasses.isActive': { $ne: false } } },
    { $group: { _id: '$hotmart.enrolledClasses.className', n: { $sum: 1 } } }
  ])) as Array<{ _id: string; n: number }>

  const byTurma = new Map<number, Cohort[]>()
  for (const r of rows) {
    const p = parseTurmaName(r._id || '')
    if (p.turmaNumber === null) continue
    const arr = byTurma.get(p.turmaNumber) || []
    arr.push({ className: r._id, n: r.n, level: p.renovLevel, expiry: p.accessEndOgi })
    byTurma.set(p.turmaNumber, arr)
  }

  // 2. vendas por turma — TODAS as ofertas de renovação (inclui inactivas),
  //    atribuídas por turmaNumbers se existir, senão pelo NOME da oferta
  const offers = await RenewalOffer.find({})
    .select('turmaNumbers offerName salesCount isRenewal')
    .lean()
    .exec() as Array<{ turmaNumbers?: number[]; offerName?: string; salesCount?: number; isRenewal?: boolean }>

  const vendasByTurma = new Map<number, number>()
  for (const o of offers) {
    const parsed = parseOfferName(o.offerName || '')
    const isRen = o.isRenewal || parsed.isRenewal || /renova/i.test(o.offerName || '')
    if (!isRen) continue
    const assigned = (o.turmaNumbers || []).filter((n) => n > 0)
    const turmas = assigned.length > 0 ? assigned : parsed.turmaNumbers
    for (const t of turmas) {
      vendasByTurma.set(t, (vendasByTurma.get(t) || 0) + (o.salesCount || 0))
    }
  }

  const turmas: RenewalPerformance[] = []
  for (const [turmaNumber, cohorts] of byTurma) {
    const alunos = cohorts.reduce((s, c) => s + c.n, 0)
    const renovados = cohorts.filter((c) => c.level >= 1).reduce((s, c) => s + c.n, 0)
    const vendas = vendasByTurma.get(turmaNumber) || 0
    const renovacoes = Math.max(renovados, vendas)
    const taxa = alunos > 0 ? renovacoes / alunos : 0

    // cohort representativo: o que renova agora (mês corrente em diante, este ano);
    // senão o de expiração mais recente
    const renewing = cohorts
      .filter((c) => c.expiry && c.expiry >= cutoff && c.expiry.getUTCFullYear() === currentYear)
      .sort((a, b) => a.expiry!.getTime() - b.expiry!.getTime())[0]
    const latest = cohorts
      .filter((c) => c.expiry)
      .sort((a, b) => b.expiry!.getTime() - a.expiry!.getTime())[0]
    const repr = renewing || latest

    turmas.push({
      turmaNumber,
      className: repr?.className ?? null,
      alunos,
      renovados,
      vendas,
      taxa,
      vsMeta: taxa - RENEWAL_TARGET,
      nextExpiry: renewing?.expiry ? renewing.expiry.toISOString() : null,
      renewsThisYear: Boolean(renewing)
    })
  }

  // a renovar este ano primeiro (por data), depois as restantes por nº de turma
  turmas.sort((a, b) => {
    if (a.renewsThisYear !== b.renewsThisYear) return a.renewsThisYear ? -1 : 1
    if (a.renewsThisYear && b.renewsThisYear) return (a.nextExpiry || '').localeCompare(b.nextExpiry || '')
    return a.turmaNumber - b.turmaNumber
  })

  const totalVendas = turmas.reduce((s, t) => s + t.vendas, 0)
  const totalAlunos = turmas.reduce((s, t) => s + t.alunos, 0)
  const totalRenov = turmas.reduce((s, t) => s + Math.max(t.renovados, t.vendas), 0)
  const acimaMeta = turmas.filter((t) => t.taxa >= RENEWAL_TARGET).length

  return {
    target: RENEWAL_TARGET,
    turmas,
    totals: {
      vendas: totalVendas,
      alunos: totalAlunos,
      taxaMedia: totalAlunos > 0 ? totalRenov / totalAlunos : 0,
      acimaMeta
    }
  }
}
