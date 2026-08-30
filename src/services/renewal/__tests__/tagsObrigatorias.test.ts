import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LISTA_OBRIGATORIA,
  TAGS_ESTADO_VIGIADAS,
  TAGS_OBRIGATORIAS,
  eTagEstadoVigiada,
  eTagObrigatoria,
  eTagVigiada,
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
  assert.equal(nomeDaTagObrigatoria('710'), 'Aluno OGI Antigo')
  assert.equal(nomeDaTagObrigatoria('999'), null)
})

// ── a "Aluno OGI Antigo": vigiada, nunca obrigatoria ────────────────

test('a 710 e vigiada mas NAO obrigatoria', () => {
  assert.deepEqual(
    TAGS_ESTADO_VIGIADAS.map((tag) => tag.id),
    ['710']
  )
  assert.equal(eTagEstadoVigiada('710'), true)
  assert.equal(eTagVigiada('710'), true)

  // Se fosse obrigatoria, todos os activos que nao a tem apareciam em
  // falta -- centenas de faltas falsas. E o oposto do que ela significa.
  assert.equal(eTagObrigatoria('710'), false)
})

test('as obrigatorias tambem sao vigiadas, e o resto nao', () => {
  assert.equal(eTagVigiada('347'), true)
  assert.equal(eTagVigiada('676'), true)
  assert.equal(eTagVigiada('643'), false)
  assert.equal(eTagVigiada(null), false)
})

test('as duas listas nao se sobrepoem', () => {
  const obrigatorias = new Set(TAGS_OBRIGATORIAS.map((tag) => tag.id))
  for (const tag of TAGS_ESTADO_VIGIADAS) {
    assert.equal(obrigatorias.has(tag.id), false, `${tag.id} nao pode estar nas duas`)
  }
})
