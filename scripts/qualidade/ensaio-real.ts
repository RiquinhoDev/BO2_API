// O pipeline COM os espelhos verdadeiros. Lê a Hotmart e a AC a sério,
// e prova o detector contra a API: uma leitura sem novidade tem de dar
// zero eventos. As escritas para fora continuam fechadas à chave.
import { loadConfig } from '../../src/config/appConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'
initializeRuntimeConfig(loadConfig(process.env))
import mongoose from 'mongoose'
import * as pipeline from '../../src/services/renewal/renewalPipeline.service'
import { syncActiveStudentSalesHistory } from '../../src/services/renewal/hotmartSalesHistory.service'
import { syncActiveStudentAcRenewalData } from '../../src/services/renewal/acRenewalDataSync.service'
import { syncAcStudentTags } from '../../src/services/renewal/acStudentTagsSync.service'
import { syncAcExpirationDates } from '../../src/services/renewal/acExpirationSync.service'
import { syncTurmaTags } from '../../src/services/renewal/acTurmaTagSync.service'
import { handleRefunds } from '../../src/services/renewal/refundHandler.service'
import { gerarTimelinesEmLote } from '../../src/services/renewal/renewalTimeline.service'
import RenewalEvent from '../../src/models/renewal/RenewalEvent'
import { abrirEsperasDeTurma } from '../../src/services/renewal/esperaDeTurma'
import User from '../../src/models/user'

const correr = (pipeline as any).runRenewalPipelineComDependencias as (d: Record<string, any>) => Promise<any>

async function main() {
  await mongoose.connect(process.env.MONGO_URI!)
  const db = mongoose.connection.db!
  const acAntes = await db.collection('acwritelogs').countDocuments({ dryRun: false })
  const filaAntes = await db.collection('renewalevents').countDocuments()
  console.log('ANTES  escritas reais:', acAntes, '| fila:', filaAntes, '|', new Date().toISOString())

  const marcados: any[] = []
  const report = await correr({
    isJobSwitchEnabled: async () => true,
    // Os espelhos a sério. Lêem a Hotmart e a AC, escrevem só na nossa BD.
    syncActiveStudentSalesHistory,
    syncActiveStudentAcRenewalData,
    syncAcStudentTags,
    // O Discord está LIGADO em produção; nunca a sério aqui.
    runDiscordRolesSyncJob: async () => ({ saltadoNoEnsaio: true }),
    abrirEsperas: async () => {
      const users = await (User as any).find({ 'hotmart.enrolledClasses.0': { $exists: true }, 'combined.status': 'ACTIVE' })
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

  console.log('\n' + '='.repeat(60))
  console.log('ESPERAS:', JSON.stringify(report.esperas))
  console.log('FILA:', JSON.stringify(report.fila))
  console.log('marcações:', marcados.length ? JSON.stringify(marcados) : 'nenhuma')
  for (const passo of ['hotmartSales', 'acRenewalData', 'acStudentTags', 'acExpiration', 'acTurmaTags', 'acRefunds', 'timelines'] as const) {
    const r = (report as any)[passo]
    console.log('\n--- ' + passo + ' --- ' + (r.skipped ? 'SALTADO' : r.success ? 'ok' : 'FALHOU: ' + r.error) + ` (${Math.round(r.durationMs / 1000)}s)`)
    for (const [k, v] of Object.entries(r.report ?? {})) {
      if (Array.isArray(v)) { if (v.length) console.log('   ', String(k).padEnd(26), v.length, 'itens') }
      else console.log('   ', String(k).padEnd(26), v)
    }
  }
  const acDepois = await db.collection('acwritelogs').countDocuments({ dryRun: false })
  console.log('\nDEPOIS escritas reais:', acDepois, acDepois === acAntes ? '✅ nenhuma' : '⚠️ ESCREVEU')
  await mongoose.disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
