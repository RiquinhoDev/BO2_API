// ════════════════════════════════════════════════════════════
// 📁 scripts/qualidade/ensaio-da-fila.ts
// Corre o detector contra os dados reais SEM gravar nada.
//
// Duas perguntas:
//   1. quantos eventos daria uma leitura da Hotmart feita agora?
//   2. com a fila vazia, o que é que as duas peças fariam?
//
// A resposta certa à segunda é "nada". Se der outra coisa, o filtro
// não está a funcionar.
// ════════════════════════════════════════════════════════════

import { loadConfig } from '../../src/config/appConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'
initializeRuntimeConfig(loadConfig(process.env))

import mongoose from 'mongoose'
import { syncTurmaTags } from '../../src/services/renewal/acTurmaTagSync.service'
import { handleRefunds } from '../../src/services/renewal/refundHandler.service'

async function main() {
  await mongoose.connect(process.env.MONGO_URI!)
  const db = mongoose.connection.db!

  const naFila = await db.collection('renewalevents').countDocuments()
  console.log('eventos na fila agora:', naFila)

  // 1. O que uma leitura nova traria: nada, porque o espelho já tem tudo.
  //    O detector compara com o que lá está, e o que lá está é o que a
  //    Hotmart devolveria. Só uma venda nova de verdade daria evento.
  const vendas = await db.collection('hotmartsalehistories')
    .find({}).project({ sales: 1 }).toArray()
  const comTransacao = vendas.flatMap((v: any) => (v.sales ?? []))
    .filter((s: any) => s?.transaction).length
  const semTransacao = vendas.flatMap((v: any) => (v.sales ?? []))
    .filter((s: any) => !s?.transaction).length
  console.log('vendas no espelho com código de transacção:', comTransacao)
  console.log('vendas sem código (o detector ignora-as)  :', semTransacao)

  // 2. As duas peças com a fila vazia.
  console.log('\n─── tags de turma, fila vazia ───')
  const tags: any = await syncTurmaTags({ dryRun: true, userIds: [] })
  console.log('  candidatos', tags.candidatos, '| semEvento', tags.semEvento, '| aAplicar', tags.aAplicar)

  console.log('\n─── reembolsos, fila vazia ───')
  const reemb: any = await handleRefunds({ dryRun: true, transacoes: [] })
  console.log('  reembolsos', reemb.reembolsos, '| semEvento', reemb.semEvento, '| aRemover', reemb.aRemover)

  const ok = tags.aAplicar === 0 && reemb.aRemover === 0
  console.log('\n' + (ok
    ? '✅ com a fila vazia, nenhuma das duas escreve na AC'
    : '⚠️  ALGUMA COISA IA ESCREVER — o filtro não está a funcionar'))

  await mongoose.disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
