// ════════════════════════════════════════════════════════════
// 📁 scripts/qualidade/ensaio-completo.ts
// A noite inteira, com todos os pontos de controlo, sem escrever
// uma linha na ActiveCampaign nem no Discord.
//
// Corre a cadeia verdadeira — o "1º" (HotmartSync) a puxar as
// renovações no fim, como em produção — com as escritas para fora
// fechadas à chave. O interruptor é forçado a LIGADO aqui, para se
// ver o que aconteceria; na BD continua a false.
//
// Cada ponto de controlo diz OK ou FALHA e a razão. No fim, um
// veredicto: pode ligar-se, ou não.
// ════════════════════════════════════════════════════════════

import { loadConfig } from '../../src/config/appConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'
initializeRuntimeConfig(loadConfig(process.env))

import mongoose from 'mongoose'
import * as pipeline from '../../src/services/renewal/renewalPipeline.service'
import { syncAcExpirationDates } from '../../src/services/renewal/acExpirationSync.service'
import { syncTurmaTags } from '../../src/services/renewal/acTurmaTagSync.service'
import { handleRefunds } from '../../src/services/renewal/refundHandler.service'
import { gerarTimelinesEmLote } from '../../src/services/renewal/renewalTimeline.service'
import RenewalEvent from '../../src/models/renewal/RenewalEvent'
import { abrirEsperasDeTurma } from '../../src/services/renewal/esperaDeTurma'
import User from '../../src/models/user'

const correr = (pipeline as any).runRenewalPipelineComDependencias as
  (d: Record<string, any>) => Promise<any>

const pontos: Array<{ ok: boolean; nome: string; detalhe: string }> = []
const check = (ok: boolean, nome: string, detalhe: string) => {
  pontos.push({ ok, nome, detalhe })
  console.log(`  ${ok ? '✅' : '❌'} ${nome.padEnd(46)} ${detalhe}`)
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI!)
  const db = mongoose.connection.db!
  const conta = (c: string, q: Record<string, unknown> = {}) => db.collection(c).countDocuments(q)

  // ── ANTES ───────────────────────────────────────────────────
  console.log('═══ ANTES ═══')
  const escritasAntes = await conta('acwritelogs', { dryRun: false })
  const filaAntes = await conta('renewalevents')
  const tratadosAntes = await conta('renewalevents', {
    $or: [{ 'tratado.tagTurma': { $ne: null } }, { 'tratado.reembolso': { $ne: null } }]
  })
  console.log(`  escritas reais na AC: ${escritasAntes} · fila: ${filaAntes} · tratados: ${tratadosAntes}`)

  const crons = await db.collection('cronjobconfigs').find({}).toArray()
  const ligado = (n: string) => crons.find((c: any) => c.name === n)?.schedule?.enabled === true

  console.log('\n═══ 1. OS INTERRUPTORES ═══')
  for (const n of ['DailyPipeline', 'EvaluateRules', 'EvaluateRules_TEST']) {
    check(!ligado(n), `Janeiro desligado: ${n}`, ligado(n) ? 'LIGADO' : 'off')
  }
  for (const n of ['RenewalPipeline', 'AcExpirationSync', 'AcTurmaTagSync', 'AcRefundHandler']) {
    check(ligado(n), `escritor LIGADO: ${n}`, ligado(n) ? 'on' : 'OFF')
  }
  check(!ligado('RenewalAcSync'), 'RenewalAcSync continua off (substituido)', ligado('RenewalAcSync') ? 'LIGADO' : 'off')
  check(ligado('HotmartSync'), 'o "1º" está ligado (puxa as renovações)', ligado('HotmartSync') ? 'on' : 'OFF')
  check(ligado('AcTagWatch'), 'vigilância ligada', ligado('AcTagWatch') ? 'on' : 'OFF')

  // ── A CADEIA ────────────────────────────────────────────────
  console.log('\n═══ 2. A CADEIA, EM SECO ═══')
  const marcados: Array<[number, string]> = []
  const report = await correr({
    isJobSwitchEnabled: async () => true,
    syncActiveStudentSalesHistory: async () => ({ saltado: 'espelho de vendas' }),
    syncActiveStudentAcRenewalData: async () => ({ saltado: 'espelho de datas' }),
    syncAcStudentTags: async () => ({ saltado: 'espelho de tags' }),
    runDiscordRolesSyncJob: async () => ({ saltado: 'Discord, está ligado a sério' }),
    abrirEsperas: async () => {
      const users = await (User as any)
        .find({ 'hotmart.enrolledClasses.0': { $exists: true }, 'combined.status': 'ACTIVE' })
        .select('_id email hotmart.enrolledClasses').lean().exec() as any[]
      return abrirEsperasDeTurma(users.map((u) => {
        const ts = u.hotmart?.enrolledClasses ?? []
        const act = ts.filter((x: any) => x?.className && x.isActive !== false)
        return { userId: u._id, email: u.email, turma: (act.at(-1) ?? ts.filter((x: any) => x?.className).at(-1))?.className ?? null }
      }))
    },
    lerFila: async () => {
      const [compras, reembolsos] = await Promise.all([
        (RenewalEvent as any).find({ tipo: { $in: ['compra', 'espera-turma'] }, 'tratado.tagTurma': null }).select('_id userId').lean().exec(),
        (RenewalEvent as any).find({ tipo: 'reembolso', 'tratado.reembolso': null }).select('_id transacao').lean().exec()
      ])
      return { compras: compras ?? [], reembolsos: reembolsos ?? [] }
    },
    marcarTratado: async (ids: unknown[], campo: string) => { marcados.push([ids.length, campo]) },
    syncAcExpirationDates: (o: any) => syncAcExpirationDates({ ...o, dryRun: true }),
    syncTurmaTags: (o: any) => syncTurmaTags({ ...o, dryRun: true }),
    handleRefunds: (o: any) => handleRefunds({ ...o, dryRun: true }),
    gerarTimelinesEmLote
  })

  const passo = (k: string) => (report as any)[k]
  for (const [k, nome] of [
    ['acExpiration', 'expiração (332)'],
    ['acTurmaTags', 'tags de turma'],
    ['acRefunds', 'reembolsos'],
    ['timelines', 'timelines']
  ] as const) {
    const r = passo(k)
    check(r.success, `passo corre sem erro: ${nome}`, r.skipped ? 'saltado' : r.success ? `${Math.round(r.durationMs / 1000)}s` : r.error)
  }

  // ── O QUE ESCREVERIA ────────────────────────────────────────
  console.log('\n═══ 3. O QUE ESCREVERIA NA AC ═══')
  const exp = passo('acExpiration').report ?? {}
  const tags = passo('acTurmaTags').report ?? {}
  const reemb = passo('acRefunds').report ?? {}
  console.log(`  expiração:  needsWrite ${exp.needsWrite} · alreadyInSync ${exp.alreadyInSync} · encurtaria ${exp.skippedWouldShorten} · divergentes ${(exp.divergentes ?? []).length}`)
  console.log(`  tags:       aAplicar ${tags.aAplicar} · jaTem ${tags.jaTem} · àEspera ${tags.aEsperaDeTurma} · semEvento ${tags.semEvento}`)
  console.log(`  reembolsos: aRemover ${reemb.aRemover} · foraDaAllowlist ${reemb.foraDaAllowlist} · semEvento ${reemb.semEvento}`)
  check((reemb.foraDaAllowlist ?? 0) === 0, 'nenhuma tag fora da allowlist', `${reemb.foraDaAllowlist ?? 0}`)

  // ── A FILA ──────────────────────────────────────────────────
  console.log('\n═══ 4. A FILA ═══')
  console.log(`  esperas: ${JSON.stringify(report.esperas)}`)
  console.log(`  fila: ${JSON.stringify(report.fila)} · marcações: ${marcados.length ? JSON.stringify(marcados) : 'nenhuma'}`)
  const naGenerica = report.esperas?.naGenerica ?? 0
  check((report.esperas?.erros ?? 0) === 0, 'abrir esperas sem erros', `${report.esperas?.erros ?? 0}`)
  check(tags.aEsperaDeTurma === naGenerica, 'quem está na genérica fica à espera', `${tags.aEsperaDeTurma} de ${naGenerica}`)

  // ── DEPOIS ──────────────────────────────────────────────────
  console.log('\n═══ 5. NADA ESCAPOU ═══')
  const escritasDepois = await conta('acwritelogs', { dryRun: false })
  const tratadosDepois = await conta('renewalevents', {
    $or: [{ 'tratado.tagTurma': { $ne: null } }, { 'tratado.reembolso': { $ne: null } }]
  })
  check(escritasDepois === escritasAntes, 'nenhuma escrita real na AC', `${escritasAntes} → ${escritasDepois}`)
  check(tratadosDepois === tratadosAntes, 'fila intacta', `${tratadosAntes} → ${tratadosDepois}`)

  const cronsDepois = await db.collection('cronjobconfigs').find({}).toArray()
  const mudou = cronsDepois.filter((c: any) => {
    const antes = crons.find((x: any) => x.name === c.name)
    return antes?.schedule?.enabled !== c.schedule?.enabled
  })
  check(mudou.length === 0, 'nenhum interruptor mudou', mudou.length ? mudou.map((m: any) => m.name).join(', ') : 'nenhum')

  // ── VEREDICTO ───────────────────────────────────────────────
  const falhas = pontos.filter((p) => !p.ok)
  console.log('\n' + '═'.repeat(64))
  console.log(`${pontos.length - falhas.length} de ${pontos.length} pontos de controlo OK`)
  if (falhas.length) {
    console.log('\nFALHARAM:')
    for (const f of falhas) console.log(`  ❌ ${f.nome} — ${f.detalhe}`)
    console.log('\n⚠️  NÃO LIGAR até isto estar resolvido')
  } else {
    console.log('\n✅ tudo verde — o sistema pode ser ligado')
  }
  await mongoose.disconnect()
  process.exit(falhas.length ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
