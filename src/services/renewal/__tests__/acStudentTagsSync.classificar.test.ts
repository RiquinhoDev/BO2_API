import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classificar } from '../acStudentTagsSync.service'

const semCanonicas = new Set<string>()

test('apanha as tags de estado no plural — o caso que estava cego', () => {
  assert.equal(classificar('Alunos OGI Ativos', semCanonicas), 'outra')
  assert.equal(classificar('Alunos OGI Antigos', semCanonicas), 'outra')
})

test('continua a apanhar o singular', () => {
  assert.equal(classificar('Aluno OGI Antigo', semCanonicas), 'outra')
})

test('tags de turma continuam a ser membresia', () => {
  assert.equal(classificar('Aluno OGI L2409 - Turma 11', semCanonicas), 'membresia')
  assert.equal(classificar('Aluno OGI 2505 - Renovação Turma 10 [2anos]', semCanonicas), 'membresia')
})

test('a lista canonica ganha a tudo', () => {
  const canonicas = new Set(['aluno ogi l2409 - turma 11'])
  assert.equal(classificar('Aluno OGI L2409 - Turma 11', canonicas), 'canonica')
})

test('tags de outros produtos continuam de fora', () => {
  assert.equal(classificar('Comprou Organiza as tuas Finanças', semCanonicas), null)
  assert.equal(classificar('Newsletter', semCanonicas), null)
})
