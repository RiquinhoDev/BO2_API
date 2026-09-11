import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CronJobDispatcher } from '../scheduler/jobDispatcher'

// As renovações correm EM CIMA do "1º" — o HotmartSync, que corre todas as
// noites às 04:00 e demora entre 22 e 109 minutos. Encadeadas e não a horas
// fixas: é o "1º" que actualiza as turmas dos alunos, e as renovações lêem-nas
// para decidir a tag. Um cron próprio teria de adivinhar a duração, e começar
// a meio era ler turmas incompletas.
//
// O gancho já existiu antes, no `dailyPipelineExecution`. Nunca disparou: esse
// ficheiro só é alcançado por um job com `syncType: 'pipeline'`, e o "1º" é
// `syncType: 'hotmart'`. Ficou preso ao job errado durante meses.

const job = (nome: string, tipo: string) => ({
  _id: { toString: () => 'job-1' },
  name: nome,
  syncType: tipo
}) as never

function montar(over: Record<string, unknown> = {}) {
  const ordem: string[] = []
  const deps = {
    fetchHotmart: async () => { ordem.push('fetchHotmart'); return [] },
    fetchCurseduca: async () => { ordem.push('fetchCurseduca'); return [] },
    executeUniversalSync: async () => {
      ordem.push('universalSync')
      return { success: true, stats: { total: 10, inserted: 0, updated: 10, errors: 0, skipped: 0 } }
    },
    isRenewalPipelineEnabled: async () => { ordem.push('lerInterruptor'); return true },
    runRenewalPipeline: async () => { ordem.push('renovacoes'); return { success: true } },
    ...over
  }
  return { ordem, dispatcher: new CronJobDispatcher(deps as never) }
}

test('o "1º" corre as renovacoes no fim, quando o interruptor esta ligado', async () => {
  const { ordem, dispatcher } = montar()

  await dispatcher.execute(job('HotmartSync', 'hotmart'))

  assert.deepEqual(ordem, ['fetchHotmart', 'universalSync', 'lerInterruptor', 'renovacoes'])
})

test('com o interruptor desligado o "1º" acaba e fica por ali', async () => {
  const { ordem, dispatcher } = montar({ isRenewalPipelineEnabled: async () => false })

  await dispatcher.execute(job('HotmartSync', 'hotmart'))

  assert.equal(ordem.includes('renovacoes'), false)
})

test('o interruptor e lido a cada noite, nao no arranque', async () => {
  // Assim liga-se e desliga-se sem reiniciar a aplicacao.
  let leituras = 0
  const { dispatcher } = montar({
    isRenewalPipelineEnabled: async () => { leituras += 1; return false }
  })

  await dispatcher.execute(job('HotmartSync', 'hotmart'))
  await dispatcher.execute(job('HotmartSync', 'hotmart'))

  assert.equal(leituras, 2)
})

test('o sync da CursEduca nao arrasta as renovacoes', async () => {
  // So o "1º" as puxa. A CursEduca nao tem nada a ver com o OGI.
  const { ordem, dispatcher } = montar()

  await dispatcher.execute(job('CursEducaSync', 'curseduca'))

  assert.deepEqual(ordem, ['fetchCurseduca', 'universalSync'])
})

test('um "1º" que falhou nao deixa as renovacoes correr', async () => {
  // Sem espelho fresco, as renovacoes leriam turmas velhas.
  const { ordem, dispatcher } = montar({
    executeUniversalSync: async () => {
      ordem.push('universalSync')
      return { success: false, stats: {} }
    }
  })

  await dispatcher.execute(job('HotmartSync', 'hotmart'))

  assert.equal(ordem.includes('renovacoes'), false)
})

test('renovacoes que rebentam nao derrubam o "1º"', async () => {
  // O espelho ja esta gravado e e isso que interessa ao resto do sistema.
  const { dispatcher } = montar({
    runRenewalPipeline: async () => { throw new Error('AC em baixo') }
  })

  const r = await dispatcher.execute(job('HotmartSync', 'hotmart'))

  assert.equal(r.success, true)
})

test('ler o interruptor e falhar tambem nao derruba o "1º"', async () => {
  const { dispatcher } = montar({
    isRenewalPipelineEnabled: async () => { throw new Error('Mongo em baixo') }
  })

  const r = await dispatcher.execute(job('HotmartSync', 'hotmart'))

  assert.equal(r.success, true)
})
