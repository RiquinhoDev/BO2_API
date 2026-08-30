import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LISTA_OBRIGATORIA,
  TAGS_OBRIGATORIAS,
  eTagObrigatoria,
  nomeDaTagObrigatoria
} from '../tagsObrigatorias'

test('as obrigatorias nomeadas sao a 347 e a 676', () => {
  assert.deepEqual(
    TAGS_OBRIGATORIAS.map((tag) => tag.id),
    ['347', '676']
  )
  assert.equal(TAGS_OBRIGATORIAS[0].nome, 'Alunos OGI Ativos')
  assert.equal(TAGS_OBRIGATORIAS[1].nome, 'OGI - Aluno ou Ex-Aluno')
})

test('a lista obrigatoria e a 2, e nao e uma tag', () => {
  assert.equal(LISTA_OBRIGATORIA.id, '2')
  assert.equal(LISTA_OBRIGATORIA.nome, 'Alunos OGI')
  assert.equal(eTagObrigatoria(LISTA_OBRIGATORIA.id), false)
})

test('eTagObrigatoria aceita numero e string, e nao rebenta com vazios', () => {
  assert.equal(eTagObrigatoria('347'), true)
  assert.equal(eTagObrigatoria(347), true)
  assert.equal(eTagObrigatoria('676'), true)
  assert.equal(eTagObrigatoria('260'), false)
  assert.equal(eTagObrigatoria(null), false)
  assert.equal(eTagObrigatoria(undefined), false)
  assert.equal(eTagObrigatoria(''), false)
})

test('o nome oficial vem do id, para a tag poder ser renomeada na AC', () => {
  assert.equal(nomeDaTagObrigatoria('347'), 'Alunos OGI Ativos')
  assert.equal(nomeDaTagObrigatoria('676'), 'OGI - Aluno ou Ex-Aluno')
  assert.equal(nomeDaTagObrigatoria('999'), null)
})
