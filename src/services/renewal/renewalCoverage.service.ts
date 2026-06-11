// ════════════════════════════════════════════════════════════
// src/services/renewal/renewalCoverage.service.ts
// Lista de turmas (multi-select do BO) + cobertura + janela de renovação.
//
// "Renova este ano" = a turma tem ≥1 cohort cujo acesso expira no ano civil
// corrente (considerando turmas de 1 e 2 anos via parseTurmaName). Serve para
// reduzir o ruído: turmas que já expiraram há muito ou que só renovam em anos
// futuros (ex: cohorts de 2 anos → 2027) não aparecem como urgentes.
//
// Uma turma fica "coberta" quando existe ≥1 oferta ACTIVA, confirmada
// (isManuallyEdited) e de renovação, cujo turmaNumbers inclui o número.
// ════════════════════════════════════════════════════════════

import RenewalOffer from '../../models/RenewalOffer'
import User from '../../models/user'
import { parseTurmaName } from './turmaParser'

type AggregateModel = { aggregate: (...args: any[]) => any }
const UserAgg = User as unknown as AggregateModel

export interface TurmaInfo {
  turmaNumber: number
  studentCount: number
  studentsThisYear: number // alunos cujo cohort expira no ano corrente
  renewsThisYear: boolean
  nextExpiry: string | null // ISO — próxima expiração (ano corrente ou futuro)
  hasActiveOffer: boolean
}

export async function getTurmasWithCoverage(): Promise<TurmaInfo[]> {
  const now = new Date()
  const currentYear = now.getUTCFullYear()

  // 1. nomes de turma distintos (Hotmart) + nº de alunos
  const rows = (await UserAgg.aggregate([
    { $unwind: '$hotmart.enrolledClasses' },
    { $match: { 'hotmart.enrolledClasses.isActive': { $ne: false } } },
    { $group: { _id: '$hotmart.enrolledClasses.className', n: { $sum: 1 } } }
  ])) as Array<{ _id: string; n: number }>

  interface Acc {
    studentCount: number
    studentsThisYear: number
    nextExpiry: Date | null
  }
  const tally = new Map<number, Acc>()

  for (const r of rows) {
    const parsed = parseTurmaName(r._id || '')
    if (parsed.turmaNumber === null) continue

    const acc = tally.get(parsed.turmaNumber) || { studentCount: 0, studentsThisYear: 0, nextExpiry: null }
    acc.studentCount += r.n

    if (parsed.accessEndOgi) {
      const expYear = parsed.accessEndOgi.getUTCFullYear()
      if (expYear === currentYear) acc.studentsThisYear += r.n
      // próxima expiração relevante: a mais cedo que ainda seja deste ano ou futura
      if (expYear >= currentYear) {
        if (!acc.nextExpiry || parsed.accessEndOgi < acc.nextExpiry) {
          acc.nextExpiry = parsed.accessEndOgi
        }
      }
    }

    tally.set(parsed.turmaNumber, acc)
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
    .map(([turmaNumber, acc]) => ({
      turmaNumber,
      studentCount: acc.studentCount,
      studentsThisYear: acc.studentsThisYear,
      renewsThisYear: acc.studentsThisYear > 0,
      nextExpiry: acc.nextExpiry ? acc.nextExpiry.toISOString() : null,
      hasActiveOffer: covered.has(turmaNumber)
    }))
    .sort((a, b) => a.turmaNumber - b.turmaNumber)
}
