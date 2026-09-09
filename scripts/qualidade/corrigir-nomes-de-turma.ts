// ════════════════════════════════════════════════════════════
// 📁 scripts/qualidade/corrigir-nomes-de-turma.ts
// Repõe o nome verdadeiro das turmas onde ficou o remendo.
//
// Dois remendos, ambos postos pelo sync das turmas quando a Hotmart
// não devolve o nome:
//   · `Turma <classId>`     — `mongooseHotmartClassSync.writer:124`
//   · `Nome não disponível` — o mesmo sítio, linha 121
//
// O nome verdadeiro não se inventa: lê-se dos OUTROS registos da
// mesma turma, que o têm. Uma turma cujo id só tenha remendos fica
// como está, e uma com dois nomes diferentes também — adivinhar o
// nome de uma turma é dar a tag errada a um aluno.
//
// Escreve só na NOSSA BD. Não toca na Hotmart nem na AC.
// Corre em seco por omissão; `--aplicar` para valer.
// ════════════════════════════════════════════════════════════

import { loadConfig } from '../../src/config/appConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'
initializeRuntimeConfig(loadConfig(process.env))

import fs from 'node:fs'
import path from 'node:path'
import { ligar, desligar } from './lib'

const APLICAR = process.argv.includes('--aplicar')
const SENTINELA = 'Nome não disponível'
/** O texto por omissão de quando se cria uma turma no backoffice. */
const POR_EDITAR = 'Nova Turma - Edite Aqui'
const eRemendo = (nome: string, classId: string): boolean =>
  nome === SENTINELA ||
  nome === POR_EDITAR ||
  nome === `Turma ${classId}` ||
  nome === 'Turma Indefinida'

async function main() {
  const db = await ligar()

  // ── 1. Que nomes é que cada turma tem, em toda a base ────────
  const nomesPorId = new Map<string, Map<string, number>>()
  const registar = (classId: unknown, nome: unknown) => {
    const id = String(classId ?? '').trim()
    const n = String(nome ?? '').trim()
    if (!id || !n) return
    if (!nomesPorId.has(id)) nomesPorId.set(id, new Map())
    const m = nomesPorId.get(id)!
    m.set(n, (m.get(n) ?? 0) + 1)
  }

  const users = await db.collection('users')
    .find({ 'hotmart.enrolledClasses.0': { $exists: true } })
    .project({ email: 1, 'hotmart.enrolledClasses': 1 }).toArray()
  for (const u of users) for (const t of u.hotmart?.enrolledClasses ?? []) registar(t.classId, t.className)

  const historico = await db.collection('studentclasshistories')
    .find({}).project({ studentId: 1, classId: 1, className: 1 }).toArray()
  for (const h of historico) registar(h.classId, h.className)

  // ── 2. O nome bom de cada turma, quando há um só ─────────────
  const nomeBom = new Map<string, string>()
  const ambiguas: Array<[string, string[]]> = []
  for (const [id, nomes] of nomesPorId) {
    const bons = [...nomes].filter(([n]) => !eRemendo(n, id))
    if (bons.length === 1) nomeBom.set(id, bons[0][0])
    else if (bons.length > 1) ambiguas.push([id, bons.map(([n, c]) => `${n} (${c})`)])
  }

  // ── 3. O que há a corrigir ───────────────────────────────────
  const emUsers: Array<{ email: string; classId: string; de: string; para: string }> = []
  for (const u of users) {
    for (const t of u.hotmart?.enrolledClasses ?? []) {
      const id = String(t.classId ?? '').trim()
      const nome = String(t.className ?? '').trim()
      if (!id || !nome || !eRemendo(nome, id)) continue
      const bom = nomeBom.get(id)
      if (bom) emUsers.push({ email: u.email, classId: id, de: nome, para: bom })
    }
  }

  const emHistorico: Array<{ id: unknown; classId: string; de: string; para: string }> = []
  for (const h of historico) {
    const id = String(h.classId ?? '').trim()
    const nome = String(h.className ?? '').trim()
    if (!id || !nome || !eRemendo(nome, id)) continue
    const bom = nomeBom.get(id)
    if (bom) emHistorico.push({ id: h._id, classId: id, de: nome, para: bom })
  }

  // ── 4. Relatório ─────────────────────────────────────────────
  console.log(APLICAR ? '── A APLICAR ──' : '── EM SECO (usa --aplicar para valer) ──')
  console.log('\nturmas com nome recuperável:', nomeBom.size)

  const porTurma = new Map<string, { para: string; users: number; hist: number }>()
  for (const x of emUsers) {
    if (!porTurma.has(x.classId)) porTurma.set(x.classId, { para: x.para, users: 0, hist: 0 })
    porTurma.get(x.classId)!.users += 1
  }
  for (const x of emHistorico) {
    if (!porTurma.has(x.classId)) porTurma.set(x.classId, { para: x.para, users: 0, hist: 0 })
    porTurma.get(x.classId)!.hist += 1
  }
  console.log('\nclassId'.padEnd(15), 'alunos  histórico   nome a repor')
  console.log('─'.repeat(78))
  for (const [id, x] of [...porTurma].sort((a, b) => b[1].users - a[1].users)) {
    console.log(String(id).padEnd(14), String(x.users).padStart(6), String(x.hist).padStart(10), '   ', x.para)
  }
  console.log('\ntotal: ' + emUsers.length + ' matrículas + ' + emHistorico.length + ' registos de histórico')

  if (ambiguas.length) {
    console.log('\n⚠️  turmas com MAIS DE UM nome — ficam como estão, não se adivinha:')
    for (const [id, nomes] of ambiguas) console.log('   ', String(id).padEnd(14), nomes.join('  |  '))
  }

  const semNome = [...nomesPorId].filter(([id, nomes]) =>
    [...nomes].every(([n]) => eRemendo(n, id))).map(([id]) => id)
  if (semNome.length) console.log('\n⚠️  turmas sem nenhum nome bom em lado nenhum:', semNome.join(', '))

  if (!APLICAR) { await desligar(); return }

  // ── 5. Fotografia antes de escrever ──────────────────────────
  const pasta = path.join(process.cwd(), 'scratchpad')
  fs.mkdirSync(pasta, { recursive: true })
  const ficheiro = path.join(pasta, `nomes-turma-antes-${new Date().toISOString().slice(0, 10)}.json`)
  fs.writeFileSync(ficheiro, JSON.stringify({ emUsers, emHistorico }, null, 2), 'utf8')
  console.log('\nfotografia do antes:', ficheiro)

  let matriculas = 0
  for (const x of emUsers) {
    const r = await db.collection('users').updateOne(
      { email: x.email, 'hotmart.enrolledClasses.classId': x.classId },
      { $set: { 'hotmart.enrolledClasses.$[el].className': x.para } },
      { arrayFilters: [{ 'el.classId': x.classId, 'el.className': x.de }] }
    )
    matriculas += r.modifiedCount
  }
  let registos = 0
  for (const x of emHistorico) {
    const r = await db.collection('studentclasshistories').updateOne(
      { _id: x.id as any }, { $set: { className: x.para } }
    )
    registos += r.modifiedCount
  }
  console.log('matrículas corrigidas:', matriculas, '| registos de histórico:', registos)

  const sobra = await db.collection('studentclasshistories').countDocuments({ className: SENTINELA })
  console.log('sentinelas que sobram no histórico:', sobra)
  await desligar()
}

main().catch((e) => { console.error(e); process.exit(1) })
