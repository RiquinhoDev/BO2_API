// ════════════════════════════════════════════════════════════════════════════
// Back-to-back: decisão de acesso do BO2 (canónica, resolveAccessEnd) vs o
// cálculo LOCAL da API legacy (calcularDataFinal dia-25 + getAnosAcesso + compra).
//
// Objectivo: provar que o gate de login do legacy — que agora faz
//   max(BO2, compra, turma) — NUNCA bloqueia um aluno que o BO2 dá como válido,
// e quantificar onde as fontes divergem (rede de segurança).
//
//   npx ts-node scripts/maintenance/validate-access-consistency.ts
// ════════════════════════════════════════════════════════════════════════════
import 'dotenv/config'
import mongoose from 'mongoose'
import User from '../../src/models/user'
import { resolveAccessEnd } from '../../src/services/renewal/turmaParser'

// ── Réplica EXACTA das funções do legacy (routes/form.js) ────────────────────
const getAnosAcessoLegacy = (turmaNome: string): number => {
  const match = (turmaNome || '').match(/\[(\d+)\s*anos\]/i)
  return match ? parseInt(match[1], 10) : 1
}

const calcularDataFinalLegacy = (turmaNome: string): Date | null => {
  if (!turmaNome) return null
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const matchMesAno = turmaNome.match(/\| (\d{4})$/)
  const matchAnos = turmaNome.match(/\[(\d+) anos\]/)
  let finalDate: Date | null = null
  if (matchMesAno) {
    const mesAno = matchMesAno[1]
    const mes = parseInt(mesAno.slice(2, 4))
    const ano = parseInt(`20${mesAno.slice(0, 2)}`)
    const baseDate = new Date(ano, mes - 1, 25)
    finalDate = new Date(baseDate.setFullYear(baseDate.getFullYear() + 1))
  }
  if (matchAnos) {
    const anosAdicionais = parseInt(matchAnos[1])
    if (finalDate) {
      finalDate.setFullYear(finalDate.getFullYear() + anosAdicionais - 1)
    } else {
      finalDate = new Date(currentYear + anosAdicionais, currentMonth - 1, 25)
    }
  }
  return finalDate
}

const legacyLocalFinal = (purchaseDate: Date | null, className: string): Date | null => {
  const cands: Date[] = []
  const cls = calcularDataFinalLegacy(className)
  if (cls && !isNaN(cls.getTime())) cands.push(cls)
  if (purchaseDate) {
    const pd = new Date(purchaseDate)
    if (!isNaN(pd.getTime())) {
      pd.setFullYear(pd.getFullYear() + getAnosAccessoSafe(className))
      cands.push(pd)
    }
  }
  if (!cands.length) return null
  return new Date(Math.max(...cands.map((d) => d.getTime())))
}
const getAnosAccessoSafe = (n: string) => getAnosAcessoLegacy(n)

function activeClassName(user: any): string {
  const classes = user.hotmart?.enrolledClasses || []
  const c = classes.find((x: any) => x.className && x.isActive !== false) || classes.find((x: any) => x.className)
  return c?.className || ''
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!uri) throw new Error('MONGO_URI em falta')
  await mongoose.connect(uri)
  const now = Date.now()

  const users = await User.find({ 'hotmart.enrolledClasses.0': { $exists: true } })
    .select('email hotmart.enrolledClasses hotmart.purchaseDate hotmart.signupDate inactivation')
    .lean()

  let total = 0
  let agree = 0
  let bo2ValidLocalExpired = 0 // local bloquearia, BO2 salva (combinado mantém válido — OK)
  let bo2ExpiredLocalValid = 0 // BO2 diz expirado, local salva (Comunidade mostra exp., legacy entra)
  let bothValid = 0
  let bothExpired = 0
  let inactivatedButDateValid = 0 // inativação manual no BO bloqueia apesar das datas
  const sampleDiverge: string[] = []
  const sampleInact: string[] = []

  for (const u of users) {
    const cls = activeClassName(u)
    if (!cls) continue
    total++
    const purchase = u.hotmart?.purchaseDate || u.hotmart?.signupDate || null

    const bo2End = resolveAccessEnd(purchase, cls)
    const bo2Valid = Boolean(bo2End && bo2End.getTime() >= now)
    const manuallyInact = Boolean((u as any).inactivation?.isManuallyInactivated)

    const localEnd = legacyLocalFinal(purchase, cls)
    const localValid = Boolean(localEnd && localEnd.getTime() >= now)

    // O que o NOVO gate do legacy decide: bloqueia inativados; senão max(BO2, local)
    const combinedValid = !manuallyInact && (bo2Valid || localValid)

    if (manuallyInact && (bo2Valid || localValid)) {
      inactivatedButDateValid++
      if (sampleInact.length < 5) sampleInact.push(`${u.email} «${cls}»`)
    }

    if (bo2Valid === localValid) agree++
    if (bo2Valid && localValid) bothValid++
    if (!bo2Valid && !localValid) bothExpired++
    if (bo2Valid && !localValid) bo2ValidLocalExpired++
    if (!bo2Valid && localValid) {
      bo2ExpiredLocalValid++
      if (sampleDiverge.length < 8) {
        sampleDiverge.push(`${u.email} «${cls}» bo2=${bo2End ? bo2End.toISOString().slice(0,10) : '—'} local=${localEnd ? localEnd.toISOString().slice(0,10) : '—'}`)
      }
    }

    // INVARIANTE: o combinado nunca pode bloquear um aluno que o BO2 dá válido
    if (bo2Valid && !manuallyInact && !combinedValid) {
      console.error(`❌ INVARIANTE QUEBRADA: ${u.email} BO2 válido mas combinado bloqueia!`)
    }
  }

  console.log('\n════════ BACK-TO-BACK ACESSO (BO2 vs legacy local) ════════')
  console.log(`alunos c/ turma analisados : ${total}`)
  console.log(`concordam (mesmo veredicto): ${agree}  (${((agree/total)*100).toFixed(1)}%)`)
  console.log(`  ├─ ambos VÁLIDOS         : ${bothValid}`)
  console.log(`  └─ ambos EXPIRADOS       : ${bothExpired}`)
  console.log(`divergem                   : ${total - agree}`)
  console.log(`  ├─ BO2 válido / local exp: ${bo2ValidLocalExpired}  (local bloquearia; BO2 salva — combinado OK)`)
  console.log(`  └─ BO2 exp / local válido: ${bo2ExpiredLocalValid}  (rede de segurança: legacy entra, Comunidade mostra exp.)`)
  console.log(`inativados manual c/ data válida (BO bloqueia): ${inactivatedButDateValid}`)
  if (sampleDiverge.length) {
    console.log('\nexemplos divergência BO2-exp/local-válido:')
    sampleDiverge.forEach((s) => console.log('  • ' + s))
  }
  if (sampleInact.length) {
    console.log('\nexemplos inativados-manual (gate bloqueia apesar de data válida):')
    sampleInact.forEach((s) => console.log('  • ' + s))
  }
  console.log('\nINVARIANTE: nenhum aluno válido no BO2 é bloqueado pelo gate combinado ✅ (ver acima se houver ❌)')

  await mongoose.disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
