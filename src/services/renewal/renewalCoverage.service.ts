// ════════════════════════════════════════════════════════════
// src/services/renewal/renewalCoverage.service.ts
// Lista de turmas (para o multi-select do BO) + cobertura de ofertas.
//
// Uma turma fica "coberta" quando existe ≥1 oferta de renovação ACTIVA,
// confirmada (isManuallyEdited) e marcada como renovação, cujo turmaNumbers
// inclui o número da turma. As turmas com alunos mas SEM oferta são o alerta:
// há turmas antigas mais baratas que precisam da sua própria oferta.
// ════════════════════════════════════════════════════════════

import RenewalOffer from '../../models/RenewalOffer'
import User from '../../models/user'
import { parseTurmaName } from './turmaParser'

type AggregateModel = { aggregate: (...args: any[]) => any }
const UserAgg = User as unknown as AggregateModel

export interface TurmaInfo {
  turmaNumber: number
  studentCount: number
  hasActiveOffer: boolean
}

export async function getTurmasWithCoverage(): Promise<TurmaInfo[]> {
  // 1. nomes de turma distintos (Hotmart) + nº de alunos
  const rows = (await UserAgg.aggregate([
    { $unwind: '$hotmart.enrolledClasses' },
    { $match: { 'hotmart.enrolledClasses.isActive': { $ne: false } } },
    { $group: { _id: '$hotmart.enrolledClasses.className', n: { $sum: 1 } } }
  ])) as Array<{ _id: string; n: number }>

  const tally = new Map<number, number>()
  for (const r of rows) {
    const turmaNumber = parseTurmaName(r._id || '').turmaNumber
    if (turmaNumber !== null) {
      tally.set(turmaNumber, (tally.get(turmaNumber) || 0) + r.n)
    }
  }

  // 2. turmas cobertas por ofertas activas/confirmadas/renovação
  const offers = await RenewalOffer.find({
    isActive: true,
    isRenewal: true,
    isManuallyEdited: true
  })
    .select('turmaNumbers')
    .lean()
    .exec() as Array<{ turmaNumbers?: number[] }>

  const covered = new Set<number>()
  for (const o of offers) {
    for (const t of o.turmaNumbers || []) covered.add(t)
  }

  // 3. juntar
  return [...tally.entries()]
    .map(([turmaNumber, studentCount]) => ({
      turmaNumber,
      studentCount,
      hasActiveOffer: covered.has(turmaNumber)
    }))
    .sort((a, b) => a.turmaNumber - b.turmaNumber)
}
