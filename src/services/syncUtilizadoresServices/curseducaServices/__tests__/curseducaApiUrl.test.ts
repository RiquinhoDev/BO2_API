import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// O CursEducaSync falhou 19 noites em 253. A causa final:
//
//   base configurada   https://prof.curseduca.pro/     <- barra no fim
//   pedido montado     `${base}/groups`
//   resultado          https://prof.curseduca.pro//groups
//   resposta           404  "Cannot GET //groups"
//
// Confirmado contra a API a 12/09/2026: com a barra, 404; sem ela, 200 e três
// grupos, dois deles de Clareza.
//
// Durante a maior parte do tempo o erro esteve tapado por um segundo problema:
// o formato de consola do logger rebentava ao registar o erro do axios, e a
// mensagem que ficava guardada era a do logger, não a da CursEduca.
//
// Uma barra a mais na configuração não pode partir o sync.

const SUPORTE = path.join(__dirname, '..', 'curseducaAdapterSupport.ts')

test('a base da API e aparada da barra final', () => {
  const fonte = fs.readFileSync(SUPORTE, 'utf8')
  const linha = fonte.split('\n').find((l) => l.includes('export const curseducaApiUrl'))
  assert.ok(linha, 'o acessor tem de existir')
  assert.match(
    linha,
    /\.replace\(\/\\\/\+\$\/,\s*['"]{2}\)|\.replace\(\/\\\/\+\$\/,\s*''\)/,
    'a barra final tem de ser aparada — senao sai //groups e a CursEduca responde 404',
  )
})

test('o aparar funciona para as formas que aparecem na configuracao', () => {
  // A mesma expressao que o acessor usa.
  const aparar = (u: string) => u.replace(/\/+$/, '')
  assert.equal(aparar('https://prof.curseduca.pro/'), 'https://prof.curseduca.pro')
  assert.equal(aparar('https://prof.curseduca.pro//'), 'https://prof.curseduca.pro')
  assert.equal(aparar('https://prof.curseduca.pro'), 'https://prof.curseduca.pro')
  // O caminho nao pode ser comido, so a barra do fim.
  assert.equal(aparar('https://prof.curseduca.pro/api/'), 'https://prof.curseduca.pro/api')
})
