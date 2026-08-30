import { test } from 'node:test'
import assert from 'node:assert/strict'
import ACStudentTag from '../../ACStudentTag'

test('o espelho guarda a pertenca a lista "Alunos OGI", com null a valer "por ler"', () => {
  const campo = ACStudentTag.schema.paths.naListaAlunosOgi
  assert.ok(campo, 'o campo naListaAlunosOgi tem de existir no espelho')
  assert.equal(campo.instance, 'Boolean')

  // `null` por omissao e o que distingue "ainda nao foi lido" de "saiu da
  // lista". Sem isto, a primeira leitura acusaria milhares de saidas que
  // nunca aconteceram.
  assert.equal(campo.options.default, null)
  assert.notEqual(campo.options.default, false)
  assert.notEqual(campo.options.required, true)
})
