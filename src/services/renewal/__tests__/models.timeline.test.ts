import { test } from 'node:test'
import assert from 'node:assert/strict'
import StudentRenewalTimeline from '../../../models/StudentRenewalTimeline'
import TurmaTagMap from '../../../models/TurmaTagMap'

test('a timeline guarda na coleccao studentrenewaltimelines', () => {
  assert.equal(StudentRenewalTimeline.collection.name, 'studentrenewaltimelines')
})

test('userId da timeline e unico', () => {
  const caminho: any = StudentRenewalTimeline.schema.path('userId')
  assert.equal(caminho.options.unique, true)
})

test('a timeline tem os campos do desenho', () => {
  const s = StudentRenewalTimeline.schema
  for (const campo of ['email', 'ciclos', 'tagsOrfas', 'tagsEstado', 'cadeia', 'turmasPorMapear', 'geradoEm', 'fontes']) {
    assert.ok(s.path(campo) || s.nested[campo], `falta o campo ${campo}`)
  }
})

test('o ciclo guarda compras, anos, acessoAte, coortes, turma e alertas', () => {
  const ciclo: any = StudentRenewalTimeline.schema.path('ciclos')
  const sub = ciclo.schema
  for (const campo of ['periodo', 'compras', 'anos', 'acessoAte', 'coortes', 'turma', 'tagEsperada', 'alertas']) {
    assert.ok(sub.path(campo), `falta o campo ${campo} no ciclo`)
  }
})

test('a coorte guarda periodo, ano e a sua tag', () => {
  const ciclo: any = StudentRenewalTimeline.schema.path('ciclos')
  const coorte: any = ciclo.schema.path('coortes')
  for (const campo of ['periodo', 'ano', 'tag']) {
    assert.ok(coorte.schema.path(campo), `falta o campo ${campo} na coorte`)
  }
})

test('o mapa de turmas guarda na coleccao turmatagmap com chave unica', () => {
  assert.equal(TurmaTagMap.collection.name, 'turmatagmap')
  const caminho: any = TurmaTagMap.schema.path('classNameNormalizado')
  assert.equal(caminho.options.unique, true)
})
