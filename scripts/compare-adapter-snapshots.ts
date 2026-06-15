// scripts/compare-adapter-snapshots.ts
// Compara os snapshots BEFORE vs AFTER do output do adapter CursEduca.
// Foco: provar ZERO regressão no que alimenta o sync (situation, grupo, datas)
// e listar as melhorias esperadas (membros que o método antigo descartava).
//
// Uso: npx ts-node --transpile-only scripts/compare-adapter-snapshots.ts

import fs from 'fs'
import path from 'path'

type Row = {
  email: string
  curseducaUserId: string
  groupId: string
  groupName: string
  subscriptionType: string | null
  situation: string | null
  isPrimary: boolean | null
  isDuplicate: boolean | null
  lastLogin: string | null
  lastAccess: string | null
  enrolledAt: string | null
  expiresAt: string | null
  progress: number | null
}

const dir = path.join(__dirname, '..', 'snapshots', 'curseduca-shadow')
const before = JSON.parse(fs.readFileSync(path.join(dir, 'adapter-BEFORE.json'), 'utf-8'))
const after = JSON.parse(fs.readFileSync(path.join(dir, 'adapter-AFTER.json'), 'utf-8'))

const key = (r: Row) => `${r.email.toLowerCase()}|${r.groupId}`
const mapB = new Map<string, Row>(before.rows.map((r: Row) => [key(r), r]))
const mapA = new Map<string, Row>(after.rows.map((r: Row) => [key(r), r]))

const onlyInAfter: Row[] = []   // melhorias: membros que o antigo descartava
const onlyInBefore: Row[] = []  // ALERTA: membros que desapareceram (regressão!)
const situationChanged: Array<{ key: string; before: string | null; after: string | null }> = []
const groupChanged: string[] = []
let same = 0

for (const [k, a] of mapA) {
  const b = mapB.get(k)
  if (!b) { onlyInAfter.push(a); continue }
  if (a.situation !== b.situation) situationChanged.push({ key: k, before: b.situation, after: a.situation })
  if (a.groupName !== b.groupName) groupChanged.push(k)
  if (a.situation === b.situation && a.groupName === b.groupName) same++
}
for (const [k, b] of mapB) {
  if (!mapA.has(k)) onlyInBefore.push(b)
}

const line = '─'.repeat(60)
console.log(line)
console.log('COMPARAÇÃO adapter BEFORE vs AFTER')
console.log(line)
console.log(`BEFORE: ${before.rows.length} items | AFTER: ${after.rows.length} items`)
console.log(`BEFORE situation:`, before.summary.bySituation)
console.log(`AFTER  situation:`, after.summary.bySituation)
console.log(line)
console.log(`✅ chave igual (situation+grupo): ${same}`)
console.log(`🟢 SÓ no AFTER (membros recuperados, antes descartados): ${onlyInAfter.length}`)
onlyInAfter.forEach(r => console.log(`     + ${r.email} [${r.groupName}] situation=${r.situation}`))
console.log(`🔴 SÓ no BEFORE (DESAPARECERAM — possível regressão!): ${onlyInBefore.length}`)
onlyInBefore.forEach(r => console.log(`     - ${r.email} [${r.groupName}] situation=${r.situation}`))
console.log(`⚠️  situation mudou (em membros comuns): ${situationChanged.length}`)
situationChanged.slice(0, 30).forEach(c => console.log(`     ~ ${c.key}: ${c.before} -> ${c.after}`))
console.log(`⚠️  grupo mudou (em membros comuns): ${groupChanged.length}`)
groupChanged.slice(0, 30).forEach(k => console.log(`     ~ ${k}`))
console.log(line)

// VEREDICTO
const regressions = onlyInBefore.length // membros perdidos = a única regressão grave possível
if (regressions === 0) {
  console.log('VEREDICTO: ✅ Sem regressão — nenhum membro foi perdido.')
  console.log(`           ${onlyInAfter.length} membro(s) recuperado(s) (bug corrigido).`)
  if (situationChanged.length > 0) {
    console.log(`           ${situationChanged.length} situation(s) mudaram — rever lista acima`)
    console.log(`           (esperado quando o antigo dava 504->'ACTIVE' adivinhado).`)
  }
} else {
  console.log(`VEREDICTO: 🔴 ATENÇÃO — ${regressions} membro(s) desapareceram. NÃO avançar sem investigar.`)
  process.exitCode = 1
}
console.log(line)
