import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtrarNaGenerica, abrirEsperasDeTurma } from '../esperaDeTurma'
import RenewalEvent from '../../../models/renewal/RenewalEvent'

// A pessoa compra a renovação e só é movida para a turma certa no fim do mês.
// Enquanto está na genérica não leva tag, e a mudança de turma não gera venda
// nenhuma — logo não gera evento de compra. Sem isto, as renovações nunca
// chegavam a receber tag.

test('só quem está na genérica conta como à espera', () => {
  const alunos = [
    { turma: 'Turma Renovação Genérica' },
    { turma: 'Turma Renovacao Generica' },
    { turma: 'Turma Renovação | 2606' },
    { turma: 'Turma 18 | 2605' },
    { turma: null }
  ]
  assert.deepEqual(
    filtrarNaGenerica(alunos).map((a) => a.turma),
    ['Turma Renovação Genérica', 'Turma Renovacao Generica']
  )
})

function comModelo(fn: () => Promise<void>) {
  const originais = {
    findOne: (RenewalEvent as any).findOne,
    create: (RenewalEvent as any).create
  }
  return async () => {
    try { await fn() } finally {
      ;(RenewalEvent as any).findOne = originais.findOne
      ;(RenewalEvent as any).create = originais.create
    }
  }
}

const query = (row: unknown) => ({ select: () => ({ lean: () => ({ exec: async () => row }) }) })

test('abre um evento por cada aluno na genérica', comModelo(async () => {
  const criados: any[] = []
  ;(RenewalEvent as any).findOne = () => query(null)
  ;(RenewalEvent as any).create = async (doc: any) => { criados.push(doc); return doc }

  const r = await abrirEsperasDeTurma([
    { userId: 'u1', email: 'a@x.pt', turma: 'Turma Renovação Genérica' },
    { userId: 'u2', email: 'b@x.pt', turma: 'Turma Renovação | 2606' },
    { userId: 'u3', email: 'c@x.pt', turma: 'Turma Renovação Genérica' }
  ])

  assert.deepEqual(r, { naGenerica: 2, jaTinhamEvento: 0, criados: 2, erros: 0 })
  assert.deepEqual(criados.map((d) => d.email), ['a@x.pt', 'c@x.pt'])
  assert.equal(criados[0].tipo, 'espera-turma')
  assert.equal(criados[0].tratado.tagTurma, null)
}))

test('correr duas vezes não enche a fila', comModelo(async () => {
  // A chave não leva data de propósito: o mesmo aluno na mesma sala de
  // espera é sempre o mesmo acontecimento.
  ;(RenewalEvent as any).findOne = () => query({ _id: 'ja-existe' })
  let criou = false
  ;(RenewalEvent as any).create = async () => { criou = true }

  const r = await abrirEsperasDeTurma([
    { userId: 'u1', email: 'a@x.pt', turma: 'Turma Renovação Genérica' }
  ])

  assert.equal(criou, false)
  assert.deepEqual(r, { naGenerica: 1, jaTinhamEvento: 1, criados: 0, erros: 0 })
}))

test('quem já foi tratado uma vez não volta a entrar na fila', comModelo(async () => {
  // A chave única recusa o duplicado. Se o aluno voltar à genérica numa
  // renovação futura, é a COMPRA que abre o evento novo — não esta.
  ;(RenewalEvent as any).findOne = () => query(null)
  ;(RenewalEvent as any).create = async () => {
    const erro: any = new Error('duplicate key')
    erro.code = 11000
    throw erro
  }

  const r = await abrirEsperasDeTurma([
    { userId: 'u1', email: 'a@x.pt', turma: 'Turma Renovação Genérica' }
  ])

  assert.deepEqual(r, { naGenerica: 1, jaTinhamEvento: 1, criados: 0, erros: 0 })
}))

test('ninguém na genérica não escreve nada', comModelo(async () => {
  let tocou = false
  ;(RenewalEvent as any).findOne = () => { tocou = true; return query(null) }
  ;(RenewalEvent as any).create = async () => { tocou = true }

  const r = await abrirEsperasDeTurma([
    { userId: 'u1', email: 'a@x.pt', turma: 'Turma 18 | 2605' }
  ])

  assert.equal(tocou, false)
  assert.deepEqual(r, { naGenerica: 0, jaTinhamEvento: 0, criados: 0, erros: 0 })
}))
