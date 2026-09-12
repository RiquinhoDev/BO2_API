import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Aconteceu a 11/09/2026. Os quatro interruptores das renovações vivem na
// colecção dos crons — é ali que o backoffice os mostra e liga — mas o
// `schedule.enabled` deles é lido de dentro do pipeline, e a `cronExpression`
// não devia disparar nada.
//
// Ao serem ligados, o agendador registou-os. O despachante não os conhece pelo
// nome, por isso encaminhou-os por `syncType: 'hotmart'` para o
// `executePlatformSync` — que corre um sync INTEIRO da Hotmart e, no fim, puxa
// a cadeia das renovações.
//
// Resultado: o AcTurmaTagSync e o AcRefundHandler correram os dois às 09:00,
// 4435 utilizadores e duas horas e meia cada, e puxaram a cadeia duas vezes.
// Nada foi escrito na AC — as guardas seguraram — mas foram quatro syncs
// completos num dia em vez de um.

const SERVICE = path.join(__dirname, '..', 'scheduler', 'service.ts')
const DISPATCHER = path.join(__dirname, '..', 'scheduler', 'jobDispatcher.ts')

const INTERRUPTORES = [
  'RenewalPipeline',
  'AcExpirationSync',
  'AcTurmaTagSync',
  'AcRefundHandler',
]

test('os quatro interruptores nao sao agendaveis', () => {
  const fonte = fs.readFileSync(SERVICE, 'utf8')
  const conjunto = fonte.match(/const INTERRUPTORES_SEM_CRON = new Set\(\[([\s\S]*?)\]\)/)
  assert.ok(conjunto, 'o conjunto tem de existir no agendador')
  for (const nome of INTERRUPTORES) {
    assert.ok(
      conjunto[1].includes(`'${nome}'`),
      `${nome} tem de estar em INTERRUPTORES_SEM_CRON — senao o despachante corre-lhe um sync Hotmart inteiro`,
    )
  }
})

test('o agendador sai antes de registar um interruptor', () => {
  const fonte = fs.readFileSync(SERVICE, 'utf8')
  const corpo = fonte.slice(fonte.indexOf('private async scheduleJob'))
  const guarda = corpo.indexOf('INTERRUPTORES_SEM_CRON.has(job.name)')
  const agenda = corpo.indexOf('schedule.scheduleJob')
  assert.ok(guarda > 0, 'a guarda tem de estar no scheduleJob')
  assert.ok(guarda < agenda, 'a guarda tem de vir ANTES de agendar')
})

test('nenhum interruptor e tratado como job especifico', () => {
  // Se estivessem em SPECIFIC_JOB_NAMES corriam o runner respectivo em vez de
  // nada. O sitio certo e nao serem agendados de todo.
  const fonte = fs.readFileSync(DISPATCHER, 'utf8')
  const lista = fonte.match(/const SPECIFIC_JOB_NAMES = \[([\s\S]*?)\]/)
  assert.ok(lista, 'a lista tem de existir')
  for (const nome of ['AcExpirationSync', 'AcTurmaTagSync', 'AcRefundHandler']) {
    assert.equal(
      lista[1].includes(`'${nome}'`),
      false,
      `${nome} nao pode estar em SPECIFIC_JOB_NAMES`,
    )
  }
})
