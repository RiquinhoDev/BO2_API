// ════════════════════════════════════════════════════════════
// src/services/renewal/renewalPerformance.service.ts
// Taxa de renovação por turma (tab "Desempenho" do BO).
//
// Funil: cada turma é uma cadeia de cohorts por nível de renovação
//   original (0) → [renov] (1) → [2a renov] (2) → ...
// Para a turma que renova agora (cohort a expirar do mês corrente em diante):
//   base   = alunos no cohort a expirar (por renovar) + alunos já no nível seguinte
//   vendas = salesCount da(s) oferta(s) atribuída(s) (renovações vendidas na Hotmart)
//   taxa   = vendas / base   ·   meta = 20% (acima = comissão)
// ════════════════════════════════════════════════════════════

import RenewalOffer from '../../models/RenewalOffer'
import User from '../../models/user'
import { parseTurmaName } from './turmaParser'

type AggregateModel = { aggregate: (...args: any[]) => any }
const UserAgg = User as unknown as AggregateModel

export const RENEWAL_TARGET = 0.2 // 20% — meta de comissão

export interface RenewalPerformance {
  turmaNumber: number
  className: string | null // cohort a renovar
  naOriginal: number // alunos no cohort a expirar (por renovar)
  naRenov: number // alunos já no nível seguinte (renovaram)
  base: number // naOriginal + naRenov
  vendas: number // salesCount das ofertas atribuídas
  taxa: number // vendas / base (0..1)
  vsMeta: number // taxa - meta (pontos percentuais em fracção)
  nextExpiry: string | null
}

export interface RenewalPerformanceResponse {
  target: number
  turmas: RenewalPerformance[]
  totals: { vendas: number; base: number; taxaMedia: number; acimaMeta: number }
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

  // 2. vendas por turma (ofertas activas/confirmadas/renovação atribuídas)
  const offers = await RenewalOffer.find({
    isActive: true,
    isRenewal: true,
    isManuallyEdited: true
  })
    .select('turmaNumbers salesCount')
    .lean()
    .exec() as Array<{ turmaNumbers?: number[]; salesCount?: number }>

  const vendasByTurma = new Map<number, number>()
  for (const o of offers) {
    for (const t of o.turmaNumbers || []) {
      vendasByTurma.set(t, (vendasByTurma.get(t) || 0) + (o.salesCount || 0))
    }
  }

  const turmas: RenewalPerformance[] = []
  for (const [turmaNumber, cohorts] of byTurma) {
    // cohort que renova agora = o que expira mais cedo, do mês corrente em diante e este ano
    const renewing = cohorts
      .filter((c) => c.expiry && c.expiry >= cutoff && c.expiry.getUTCFullYear() === currentYear)
      .sort((a, b) => (a.expiry!.getTime() - b.expiry!.getTime()))[0]
    if (!renewing) continue

    const naOriginal = renewing.n
    const naRenov = cohorts
      .filter((c) => c.level === renewing.level + 1)
      .reduce((sum, c) => sum + c.n, 0)
    const base = naOriginal + naRenov
    const vendas = vendasByTurma.get(turmaNumber) || 0
    const taxa = base > 0 ? vendas / base : 0

    turmas.push({
      turmaNumber,
      className: renewing.className,
      naOriginal,
      naRenov,
      base,
      vendas,
      taxa,
      vsMeta: taxa - RENEWAL_TARGET,
      nextExpiry: renewing.expiry!.toISOString()
    })
  }

  turmas.sort((a, b) => (a.nextExpiry || '').localeCompare(b.nextExpiry || ''))

  const totalVendas = turmas.reduce((s, t) => s + t.vendas, 0)
  const totalBase = turmas.reduce((s, t) => s + t.base, 0)
  const acimaMeta = turmas.filter((t) => t.taxa >= RENEWAL_TARGET).length

  return {
    target: RENEWAL_TARGET,
    turmas,
    totals: {
      vendas: totalVendas,
      base: totalBase,
      taxaMedia: totalBase > 0 ? totalVendas / totalBase : 0,
      acimaMeta
    }
  }
}
