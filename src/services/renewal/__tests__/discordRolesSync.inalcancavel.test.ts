import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contaInalcancavel } from '../discordRolesSync.service'

// O caso real: o parceiro do ze_viclassempretuga tem um id de Discord que
// nao existe. O bot devolve "Unknown User", isso caia em FAILED, e a
// corrida inteira ficava marcada como falhada -- tres noites seguidas.

test('"Unknown User" e conta inalcancavel — nao se retenta', () => {
  assert.equal(contaInalcancavel('Unknown User'), true)
  assert.equal(contaInalcancavel('unknown user'), true)
  assert.equal(contaInalcancavel('DiscordAPIError[10013]: Unknown User'), true)
})

test('"Unknown Member" tambem — quem nao esta no servidor', () => {
  assert.equal(contaInalcancavel('Unknown Member'), true)
  assert.equal(contaInalcancavel('DiscordAPIError[10007]'), true)
})

// A parte que nao se pode partir: uma falha de rede ou do bot TEM de
// continuar a retentar-se. Confundir as duas coisas faz o sistema
// desistir de gente que so teve azar numa noite.
test('falhas do bot e de rede continuam retentaveis', () => {
  assert.equal(contaInalcancavel('Chamada ao bot falhou: 502 Bad Gateway'), false)
  assert.equal(contaInalcancavel('sem resultado do bot'), false)
  assert.equal(contaInalcancavel('Missing Permissions'), false)
  assert.equal(contaInalcancavel('timeout of 120000ms exceeded'), false)
})

test('sem erro nenhum nao e inalcancavel', () => {
  assert.equal(contaInalcancavel(undefined), false)
  assert.equal(contaInalcancavel(null), false)
  assert.equal(contaInalcancavel(''), false)
})

test('nao apanha palavras soltas parecidas', () => {
  assert.equal(contaInalcancavel('Unknown role'), false)
  assert.equal(contaInalcancavel('User not updated'), false)
})
