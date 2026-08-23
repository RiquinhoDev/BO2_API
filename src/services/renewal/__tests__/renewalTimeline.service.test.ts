import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarEntrada, type DadosAluno } from '../renewalTimeline.service'

const dados = (p: Partial<DadosAluno>): DadosAluno => ({
  userId: 'u1',
  email: 'a@b.pt',
  vendas: null,
  tags: null,
  ac: null,
  movimentacoes: [],
  turmaAtual: null,
  ...p
})

test('montarEntrada traduz as vendas e as fontes', () => {
  const e = montarEntrada(
    dados({
      vendas: {
        sales: [
          {
            hotmartProductId: '1733154',
            productName: 'OGI',
            transaction: 'T',
            offerCode: 'o',
            transactionStatus: 'APPROVED',
            approvedDate: new Date('2025-11-30T00:00:00Z'),
            orderDate: null,
            priceValue: 145,
            currency: 'EUR'
          }
        ],
        lastSyncedAt: new Date('2026-08-20T00:00:00Z')
      }
    }),
    new Map()
  )
  assert.equal(e.vendas.length, 1)
  assert.equal(e.vendas[0].priceValue, 145)
  assert.equal(e.fontes.vendas?.toISOString(), '2026-08-20T00:00:00.000Z')
})

test('montarEntrada leva tags de percurso e de estado para o gerador decidir', () => {
  const e = montarEntrada(
    dados({
      tags: {
        tags: [
          { tagId: '347', nome: 'Alunos OGI Ativos', tipo: 'outra', aplicadaEm: null },
          { tagId: '9', nome: 'Aluno OGI L2505 - Turma 14', tipo: 'membresia', aplicadaEm: null }
        ],
        syncedAt: new Date('2026-08-19T00:00:00Z')
      }
    }),
    new Map()
  )
  assert.equal(e.tags.length, 2)
  assert.equal(e.fontes.tags?.toISOString(), '2026-08-19T00:00:00.000Z')
})

test('montarEntrada ordena as movimentacoes da mais antiga para a mais recente', () => {
  const e = montarEntrada(
    dados({
      movimentacoes: [
        { classId: 'b', className: 'Turma 7 [renov] | 2411', dateMoved: new Date('2024-11-06T00:00:00Z') },
        { classId: 'a', className: 'Turma 7 | 2311', dateMoved: new Date('2023-11-06T00:00:00Z') }
      ]
    }),
    new Map()
  )
  assert.deepEqual(e.movimentacoes.map((m) => m.classId), ['a', 'b'])
})

test('montarEntrada aguenta o aluno sem espelho nenhum', () => {
  const e = montarEntrada(dados({}), new Map())
  assert.deepEqual(e.vendas, [])
  assert.deepEqual(e.tags, [])
  assert.equal(e.turmaAtual, null)
  assert.equal(e.acExpiracao, null)
  assert.deepEqual(e.fontes, { vendas: null, tags: null, ac: null })
})

test('montarEntrada conserva a ancora do evento legado anterior', () => {
  const anchor = new Date('2025-08-12T00:00:00Z')
  const e = montarEntrada(dados({}), new Map(), anchor)
  assert.equal(e.legadoExpiracaoAncora?.toISOString(), anchor.toISOString())
})
