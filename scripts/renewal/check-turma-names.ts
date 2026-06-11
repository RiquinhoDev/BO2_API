// ════════════════════════════════════════════════════════════
// scripts/renewal/check-turma-names.ts
// Health-check dos nomes de turma (OGI). Corre o parser contra TODOS os
// nomes de turma reais e reporta os que não dão parse — turmas sem número
// (não dá p/ fazer matching de oferta) ou sem período | YYMM (não dá p/
// calcular expiração). Estes precisam de correcção manual no Backoffice.
//
//   npx ts-node scripts/renewal/check-turma-names.ts
// ════════════════════════════════════════════════════════════

import 'dotenv/config'
import mongoose from 'mongoose'
import { parseTurmaName } from '../../src/services/renewal/turmaParser'

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—')

interface Row {
  _id: string
  n: number
}

;(async () => {
  await mongoose.connect(process.env.MONGO_URI as string)
  const users = mongoose.connection.db!.collection('users')

  const names = (await users
    .aggregate([
      { $unwind: '$hotmart.enrolledClasses' },
      { $group: { _id: '$hotmart.enrolledClasses.className', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ])
    .toArray()) as unknown as Row[]

  const noTurma: Row[] = [] // sem número de turma → matching impossível
  const noExpiry: Row[] = [] // sem período → expiração impossível
  let ok = 0
  let students = 0
  let okStudents = 0

  for (const r of names) {
    if (!r._id) continue
    students += r.n
    const p = parseTurmaName(r._id)
    if (p.valid) {
      ok++
      okStudents += r.n
      continue
    }
    if (!p.hasTurma) noTurma.push(r)
    else if (!p.hasExpiry) noExpiry.push(r)
  }

  console.log('═══ health-check nomes de turma (OGI) ═══')
  console.log(`turmas distintas : ${names.length}  (ok: ${ok})`)
  console.log(`alunos cobertos  : ${okStudents}/${students} (${Math.round((okStudents / students) * 100)}%)`)

  if (noTurma.length) {
    console.log(`\n⚠ SEM número de turma (matching impossível) — ${noTurma.length}:`)
    for (const r of noTurma) console.log(`   ${r.n.toString().padStart(4)}  «${r._id}»`)
  }
  if (noExpiry.length) {
    console.log(`\n⚠ SEM período | YYMM (expiração impossível) — ${noExpiry.length}:`)
    for (const r of noExpiry) console.log(`   ${r.n.toString().padStart(4)}  «${r._id}»`)
  }
  if (!noTurma.length && !noExpiry.length) console.log('\n✓ todos os nomes fazem parse.')

  // exemplo de algumas expirações calculadas
  console.log('\n── amostra de expirações calculadas ──')
  for (const r of names.slice(0, 6)) {
    const p = parseTurmaName(r._id)
    console.log(`   «${r._id}» → T${p.turmaNumbers} expira ${fmt(p.accessEndOgi)}`)
  }

  await mongoose.disconnect()
  process.exit(noTurma.length || noExpiry.length ? 1 : 0)
})().catch((e) => {
  console.error('ERR', e.message)
  process.exit(2)
})
