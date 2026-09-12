import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseOptionalUrl, parseRequiredUrl } from '../configPrimitives'

// `new URL('https://x.pro').toString()` devolve 'https://x.pro/' — a norma
// WHATWG acrescenta a barra. Todos os consumidores montam os pedidos como
// `${base}/caminho`, o que dava '//caminho'.
//
// A CursEduca respondia 404 "Cannot GET //groups" e o sync falhou 19 noites em
// 253. A ActiveCampaign e o Discord toleram a barra a dobrar, por isso o
// defeito só se via de um lado — mas estava em todas as cinco configurações de
// URL: AC_API_URL, CURSEDUCA_API_URL, DISCORD_BOT_URL, OLD_API_URL e
// SLACK_WEBHOOK_URL.

test('um URL de origem nao ganha barra no fim', () => {
  assert.equal(parseOptionalUrl('https://prof.curseduca.pro', 'X'), 'https://prof.curseduca.pro')
})

test('uma barra escrita na configuracao tambem e aparada', () => {
  assert.equal(parseOptionalUrl('https://prof.curseduca.pro/', 'X'), 'https://prof.curseduca.pro')
  assert.equal(parseOptionalUrl('https://prof.curseduca.pro//', 'X'), 'https://prof.curseduca.pro')
})

test('o caminho sobrevive, so a barra do fim e que sai', () => {
  assert.equal(parseOptionalUrl('https://x.pro/api/3/', 'X'), 'https://x.pro/api/3')
  assert.equal(parseOptionalUrl('https://x.pro/api/3', 'X'), 'https://x.pro/api/3')
})

test('montar o pedido nao produz barra a dobrar', () => {
  const base = parseRequiredUrl('https://prof.curseduca.pro', 'CURSEDUCA_API_URL')
  assert.equal(`${base}/groups`, 'https://prof.curseduca.pro/groups')
})

test('continua a recusar o que nao e HTTP(S)', () => {
  for (const mau of ['ftp://x.pro', 'javascript:alert(1)', 'https://user:pw@x.pro', 'nao-e-url']) {
    assert.throws(() => parseOptionalUrl(mau, 'X'), /CONFIG_INVALIDA/, mau)
  }
})

test('ausente continua ausente, vazio continua a rebentar', () => {
  assert.equal(parseOptionalUrl(undefined, 'X'), undefined)
  assert.throws(() => parseOptionalUrl('   ', 'X'), /CONFIG_INVALIDA/)
  assert.throws(() => parseRequiredUrl(undefined, 'X'), /CONFIG_INVALIDA/)
})
