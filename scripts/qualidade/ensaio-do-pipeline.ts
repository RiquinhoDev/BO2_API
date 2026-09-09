// ════════════════════════════════════════════════════════════
// 📁 scripts/qualidade/ensaio-do-pipeline.ts
// O pipeline nocturno inteiro, contra os dados reais, sem escrever
// uma única linha na ActiveCampaign nem no Discord.
//
// Corre a função verdadeira — `runRenewalPipelineComDependencias` —
// e troca-lhe as dependências. Não é uma imitação do nocturno: é o
// nocturno, com as escritas para fora fechadas à chave.
//
// O QUE FICA DE FORA, e porquê:
//   · os três espelhos     lêem a Hotmart e a AC para ~900 alunos, ~28
//                          minutos. Foram sincronizados a 07/09.
//   · o Discord            está LIGADO em produção e escreveria a sério.
//   · marcarTratado        marcar sem tratar mentia à fila.
//
// O QUE CORRE A SÉRIO:
//   · a leitura da fila
//   · as três escritas, em dryRun
//   · as timelines, que só escrevem na nossa BD
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

const correr = (pipeline as any).runRenewalPipelineComDependencias as
  (d: Record<string, any>) => Promise<any>

async function main() {
  await mongoose.connect(process.env.MONGO_URI!)
  const db = mongoose.connection.db!

  const acAntes = await db.collection('acwritelogs').countDocuments({ dryRun: false })
  const filaAntes = await db.collection('renewalevents').countDocuments()
  const tratadosAntes = await db.collection('renewalevents')
    .countDocuments({ $or: [{ 'tratado.tagTurma': { $ne: null } }, { 'tratado.reembolso': { $ne: null } }] })
  console.log('ANTES  escritas reais no AcWriteLog:', acAntes, '| fila:', filaAntes, '| tratados:', tratadosAntes)

  const marcados: Array<[number, string]> = []
  const saltados: string[] = []
  const saltar = (nome: string) => async () => { saltados.push(nome); return { saltadoNoEnsaio: true } }

  const report = await correr({
    // Interruptores forçados a ligado: queremos ver o que CADA passo faria,
    // não o que os interruptores de hoje permitem.
    isJobSwitchEnabled: async () => true,

    syncActiveStudentSalesHistory: saltar('espelho: vendas Hotmart'),
    syncActiveStudentAcRenewalData: saltar('espelho: datas AC'),
    syncAcStudentTags: saltar('espelho: tags AC'),
    runDiscordRolesSyncJob: saltar('Discord (está ligado a sério)'),

    lerFila: async () => {
      const [compras, reembolsos] = await Promise.all([
        (RenewalEvent as any).find({ tipo: 'compra', 'tratado.tagTurma': null }).select('_id userId').lean().exec(),
        (RenewalEvent as any).find({ tipo: 'reembolso', 'tratado.reembolso': null }).select('_id transacao').lean().exec()
      ])
      return { compras: compras ?? [], reembolsos: reembolsos ?? [] }
    },
    marcarTratado: async (ids: unknown[], campo: string) => { marcados.push([ids.length, campo]) },

    // As três escritas, com a porta fechada.
    syncAcExpirationDates: (o: any) => syncAcExpirationDates({ ...o, dryRun: true }),
    syncTurmaTags: (o: any) => syncTurmaTags({ ...o, dryRun: true }),
    handleRefunds: (o: any) => handleRefunds({ ...o, dryRun: true }),

    // Escreve só na nossa BD, e estavam de 24/08.
    gerarTimelinesEmLote
  })

  console.log('\n' + '═'.repeat(66))
  console.log('SALTADOS:', saltados.join(' · '))
  console.log('FILA:', JSON.stringify(report.fila))
  console.log('marcações de tratado:', marcados.length ? JSON.stringify(marcados) : 'nenhuma')

  for (const passo of ['acExpiration', 'acTurmaTags', 'acRefunds', 'timelines'] as const) {
    const r = report[passo]
    console.log('\n─── ' + passo + ' ─── ' + (r.skipped ? 'SALTADO' : r.success ? 'ok' : 'FALHOU: ' + r.error) + ` (${r.durationMs}ms)`)
    for (const [k, v] of Object.entries(r.report ?? {})) {
      if (Array.isArray(v)) { if (v.length) console.log('   ', String(k).padEnd(24), v.length, 'itens') }
      else console.log('   ', String(k).padEnd(24), v)
    }
  }

  const acDepois = await db.collection('acwritelogs').countDocuments({ dryRun: false })
  const tratadosDepois = await db.collection('renewalevents')
    .countDocuments({ $or: [{ 'tratado.tagTurma': { $ne: null } }, { 'tratado.reembolso': { $ne: null } }] })
  console.log('\n' + '═'.repeat(66))
  console.log('DEPOIS escritas reais no AcWriteLog:', acDepois, '| tratados:', tratadosDepois)
  console.log(acDepois === acAntes && tratadosDepois === tratadosAntes
    ? '✅ nenhuma escrita real e a fila intacta'
    : '⚠️  ALGUMA COISA ESCREVEU A SÉRIO')

  await mongoose.disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
