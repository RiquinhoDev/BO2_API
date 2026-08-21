import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverTagDaTurma, normalizarNomeTurma } from '../turmaTagResolver'

test('turma base leva o prefixo L', () => {
  const r = resolverTagDaTurma('Turma 15 | 2509')
  assert.equal(r.tagNome, 'Aluno OGI L2509 - Turma 15')
  assert.equal(r.origem, 'convencao')
})

test('turma de renovacao com numero nao leva L', () => {
  const r = resolverTagDaTurma('Turma 10 [renov] + REITs | 2505')
  assert.equal(r.tagNome, 'Aluno OGI 2505 - Renovação Turma 10')
})

test('turma de renovacao mensal (formato novo) nao leva numero', () => {
  const r = resolverTagDaTurma('Turma Renovação | 2606')
  assert.equal(r.tagNome, 'Aluno OGI 2606 - Renovação')
})

test('2 anos no nome da turma vira [2anos] na tag, sem espaco', () => {
  const r = resolverTagDaTurma('Turma 14 [renov] [2 anos] | 2505')
  assert.equal(r.tagNome, 'Aluno OGI 2505 - Renovação Turma 14 [2anos]')
})

test('2 anos no ramo base tambem vira [2anos] na tag', () => {
  const r = resolverTagDaTurma('Turma 14 [2 anos] | 2505')
  assert.equal(r.tagNome, 'Aluno OGI L2505 - Turma 14 [2anos]')
})

test('turma agrupada nao e resolvida por convencao', () => {
  const r = resolverTagDaTurma('Turmas 1, 2 e 3 [3a renov] | 2605')
  assert.equal(r.tagNome, null)
  assert.equal(r.motivo, 'turma-agrupada')
})

test('turma sem periodo nao e resolvida', () => {
  const r = resolverTagDaTurma('Turma Pb4KBr2WOX')
  assert.equal(r.tagNome, null)
  assert.equal(r.motivo, 'sem-periodo')
})

test('turma base sem numero nao e resolvida', () => {
  const r = resolverTagDaTurma('Turma antigos alunos | 2606')
  assert.equal(r.tagNome, null)
  assert.equal(r.motivo, 'sem-numero-turma')
})

test('a excepcao ganha a convencao', () => {
  const excepcoes = new Map([
    [normalizarNomeTurma('Turma 2 [renov] | 2306'), 'Aluno OGI 2302 - Renovação Turma 2']
  ])
  const r = resolverTagDaTurma('Turma 2 [renov]  |  2306', excepcoes)
  assert.equal(r.tagNome, 'Aluno OGI 2302 - Renovação Turma 2')
  assert.equal(r.origem, 'excepcao')
})

test('a excepcao resolve mesmo uma turma agrupada', () => {
  const excepcoes = new Map([
    [normalizarNomeTurma('Turmas 1, 2 e 3 [3a renov] | 2605'), 'Aluno OGI 2605 - Renovação Turma 1 a 5']
  ])
  const r = resolverTagDaTurma('Turmas 1, 2 e 3 [3a renov] | 2605', excepcoes)
  assert.equal(r.tagNome, 'Aluno OGI 2605 - Renovação Turma 1 a 5')
  assert.equal(r.origem, 'excepcao')
})

test('a excepcao vazia significa deliberadamente que a turma nao tem tag', () => {
  const turma = 'Turma 15 | 2509'
  const r = resolverTagDaTurma(turma, new Map([[normalizarNomeTurma(turma), '']]))
  assert.equal(r.tagNome, null)
  assert.equal(r.origem, 'excepcao')
  assert.equal(r.motivo, null)
})

test('normalizarNomeTurma colapsa espacos e caixa', () => {
  assert.equal(normalizarNomeTurma('  Turma  15   |  2509 '), 'turma 15 | 2509')
})
