import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tipoDeTurma } from '../turmaParser'

test('Turma 15 | 2509', () => {
  assert.equal(tipoDeTurma('Turma 15 | 2509'), 'base')
})

test('Turma 14 + [2 anos] | 2505', () => {
  assert.equal(tipoDeTurma('Turma 14 + [2 anos] | 2505'), 'base')
})

test('Turma antigos alunos | 2606 segue o ramo da renovação genérica', () => {
  assert.equal(tipoDeTurma('Turma antigos alunos | 2606'), 'renovacao')
})

test('Turma 11 [renov] + REITs | 2509', () => {
  assert.equal(tipoDeTurma('Turma 11 [renov] + REITs | 2509'), 'renovacao')
})

test('Turma 9 [2a renov] | 2603', () => {
  assert.equal(tipoDeTurma('Turma 9 [2a renov] | 2603'), 'renovacao')
})

test('Turma 3 [3a renov] + REITs | 2511', () => {
  assert.equal(tipoDeTurma('Turma 3 [3a renov] + REITs | 2511'), 'renovacao')
})

test('Turma Renovação | 2610', () => {
  assert.equal(tipoDeTurma('Turma Renovação | 2610'), 'renovacao')
})

test('Turma Renovação Genérica', () => {
  assert.equal(tipoDeTurma('Turma Renovação Genérica'), 'renovacao')
})
