/**
 * Dry-run da vigilância de tags.
 *
 * Corre o `AcTagWatch` como ele correrá em produção, mas sem gravar nada
 * e sem tocar no espelho — para se ver o que a fila teria antes de a
 * ligar.
 *
 * Só lê. Não escreve na ActiveCampaign nem na nossa BD.
 *
 * Uso:
 *   railway run npx tsx scripts/qualidade/dry-run-vigilancia.ts
 *   railway run npx tsx scripts/qualidade/dry-run-vigilancia.ts --sensibilidade
 */
import { desligar, ligar } from './lib'
import { correrAcTagWatch } from '../../src/services/renewal/acTagWatch.service'

const p = (n: number) => String(n).padStart(6)

async function main() {
  await ligar()

  const report = await correrAcTagWatch({ dryRun: true, actualizarEspelho: false })

  console.log('═'.repeat(66))
  console.log('DRY-RUN DA VIGILÂNCIA DE TAGS')
  console.log('═'.repeat(66))
  console.log(`espelho base       ${report.espelhoBaseEm?.toISOString() ?? '—'}`)
  console.log(`alunos lidos       ${report.alunosLidos}`)
  console.log(`alunos activos     ${report.alunosActivos}   (combined.status)`)

  if (report.soAgoraVisiveis.length) {
    console.log('\ntags que o espelho passou a ver (não são eventos):')
    for (const t of report.soAgoraVisiveis) {
      console.log(`  ${t.tagId.padStart(5)}  ${p(t.associacoes)} associações  ${t.nome}`)
    }
  }

  console.log('\neventos')
  console.log(`  tags aplicadas   ${p(report.aplicadas)}`)
  console.log(`  tags removidas   ${p(report.removidas)}`)
  console.log(`  entrou na lista  ${p(report.listaEntrou)}`)
  console.log(`  saiu da lista    ${p(report.listaSaiu)}`)

  console.log('\npor origem')
  for (const [k, v] of Object.entries(report.porOrigem)) console.log(`  ${k.padEnd(16)} ${p(v)}`)

  console.log('\npor severidade')
  for (const [k, v] of Object.entries(report.porSeveridade)) console.log(`  ${k.padEnd(16)} ${p(v)}`)

  console.log(`\nlotes: ${report.lotes.length}`)
  for (const l of report.lotes) console.log(`  ${p(l.tamanho)}  ${l.tagNome}`)

  console.log(`\n── GRAVE (${report.graves.length}) ──`)
  if (!report.graves.length) console.log('  nenhum')
  for (const g of report.graves) {
    console.log(`  ${g.email}`)
    console.log(`      ${g.desalinha}`)
    console.log(`      ${g.accao} "${g.tagNome}"   lote: ${g.lote > 1 ? `${g.lote} de uma vez` : 'sozinho'}`)
  }

  const e = report.estadoDasQuatro
  console.log('\n── estado das quatro obrigatórias, em alunos activos ──')
  console.log(`  tag da turma actual        ${p(e.tagTurma.tem)} têm  ${p(e.tagTurma.faltam)} faltam`)
  console.log(`  "Alunos OGI Ativos"        ${p(e.tag347.tem)} têm  ${p(e.tag347.faltam)} faltam`)
  console.log(`  "OGI - Aluno ou Ex-Aluno"  ${p(e.tag676.tem)} têm  ${p(e.tag676.faltam)} faltam`)
  console.log(`  lista "Alunos OGI"         ${p(e.lista.tem)} têm  ${p(e.lista.faltam)} faltam  ${p(e.lista.porLer)} por ler`)
  console.log(`\n  "Aluno OGI Antigo"         ${p(e.tag710.tem)} activos a têm   (vigiada, não obrigatória)`)

  console.log('\nreferência de 30/08/2026, em 817 activos:  790/27, 798/19, 811/6, 809/2')
  console.log('Se algum destes se afastar muito, é bug de leitura — investiga antes de reportar.')

  if (report.errors.length) {
    console.log(`\nerros: ${report.errors.length}`)
    for (const err of report.errors.slice(0, 10)) console.log(`  ${err.contexto}: ${err.error}`)
  }

  console.log(`\ngravou alguma coisa? ${report.dryRun ? 'NÃO (dry-run)' : `sim, ${report.eventosGravados}`}`)

  if (process.argv.includes('--sensibilidade')) {
    console.log('\n── sensibilidade do limiar do lote ──')
    console.log('limiar    lotes   linhas em lote   linhas soltas')
    for (const limiar of [3, 5, 10]) {
      const r = await correrAcTagWatch({ dryRun: true, actualizarEspelho: false, limiarLote: limiar })
      const emLote = r.lotes.reduce((s, l) => s + l.tamanho, 0)
      const total = r.aplicadas + r.removidas + r.listaEntrou + r.listaSaiu
      console.log(
        `${String(limiar).padStart(6)} ${p(r.lotes.length)} ${p(emLote)}${p(total - emLote)}`
      )
    }
  }

  await desligar()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
