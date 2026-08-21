import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gerarTimeline, periodoDaTag, type EntradaGerador } from '../renewalTimeline.generator'
import type { VendaEntrada } from '../renewalTimeline.types'

const AGORA = new Date('2026-08-21T12:00:00Z')

const venda = (p: Partial<VendaEntrada>): VendaEntrada => ({
  hotmartProductId: '1733154',
  productName: 'O Grande Investimento',
  transaction: null,
  offerCode: null,
  transactionStatus: 'APPROVED',
  approvedDate: null,
  orderDate: null,
  priceValue: 397,
  currency: 'EUR',
  ...p
})

const entrada = (p: Partial<EntradaGerador>): EntradaGerador => ({
  vendas: [],
  tags: [],
  turmaAtual: null,
  movimentacoes: [],
  acExpiracao: null,
  acDataCompra: null,
  excepcoesTurmaTag: new Map(),
  fontes: { vendas: AGORA, tags: AGORA, ac: AGORA },
  ...p
})

test('periodoDaTag apanha os dois formatos de tag', () => {
  assert.equal(periodoDaTag('Aluno OGI L2311 - Turma 7'), '2311')
  assert.equal(periodoDaTag('Aluno OGI 2606 - Renovação'), '2606')
  assert.equal(periodoDaTag('Alunos OGI Ativos'), null)
})

test('percurso limpo: 3 ciclos, 3 tags, 3 turmas, zero alertas', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2023-11-06T00:00:00Z'), transaction: 'A' }),
        venda({ approvedDate: new Date('2024-11-05T00:00:00Z'), transaction: 'B' }),
        venda({ approvedDate: new Date('2025-11-30T00:00:00Z'), transaction: 'C' })
      ],
      tags: [
        { tagId: '1', nome: 'Aluno OGI L2311 - Turma 7', aplicadaEm: new Date('2023-11-06T00:00:00Z') },
        { tagId: '2', nome: 'Aluno OGI 2411 - Renovação Turma 7', aplicadaEm: new Date('2024-11-06T00:00:00Z') },
        { tagId: '3', nome: 'Aluno OGI 2511 - Renovação Turma 7', aplicadaEm: new Date('2025-11-30T00:00:00Z') }
      ],
      turmaAtual: { classId: 'c3', className: 'Turma 7 [2a renov] | 2511', entrouEm: new Date('2025-11-30T00:00:00Z') },
      movimentacoes: [
        { classId: 'c1', className: 'Turma 7 | 2311', entrouEm: new Date('2023-11-06T00:00:00Z') },
        { classId: 'c2', className: 'Turma 7 [renov] | 2411', entrouEm: new Date('2024-11-06T00:00:00Z') }
      ],
      acDataCompra: new Date('2025-11-30T00:00:00Z'),
      acExpiracao: new Date('2026-11-30T00:00:00Z')
    })
  )

  assert.equal(t.ciclos.length, 3)
  assert.deepEqual(t.ciclos.map((c) => c.coortes.length), [1, 1, 1])
  assert.deepEqual(t.ciclos.map((c) => c.coortes[0].tag?.id), ['1', '2', '3'])
  assert.deepEqual(t.ciclos.map((c) => c.turma?.classId), ['c1', 'c2', 'c3'])
  assert.deepEqual(t.ciclos.flatMap((c) => c.alertas), [])
  assert.equal(t.cadeia.acCompraIgualUltimaVenda, 'ok')
  assert.equal(t.cadeia.expiracaoIgualTurma, 'ok')
  assert.equal(t.cadeia.tagIgualTurma, 'ok')
  assert.equal(t.cadeia.ciclosSemMudancaTurma, 0)
})

test('ciclo de 2 anos: duas coortes, duas tags, e a turma da segunda', () => {
  // zz.carlos@hotmail.com — comprou a 03/12/2024 (99€ + 97€ de
  // extensão = 2 anos), tem a tag L2411 da coorte de Novembro em
  // que entrou e a 2511 da coorte do ano 2, e está na turma de
  // renovação de 2601. Nada disto é erro.
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2024-12-03T00:00:00Z'), priceValue: 99, transaction: 'A' }),
        venda({
          approvedDate: new Date('2024-12-03T00:10:00Z'),
          priceValue: 97,
          transaction: 'B',
          hotmartProductId: '3100292'
        })
      ],
      tags: [
        { tagId: '10', nome: 'Aluno OGI L2411 - Turma 12', aplicadaEm: new Date('2024-12-03T00:00:00Z') },
        { tagId: '11', nome: 'Aluno OGI 2511 - Renovação Turma 12', aplicadaEm: new Date('2025-11-10T00:00:00Z') }
      ],
      turmaAtual: { classId: 'c', className: 'Turma Renovação | 2601', entrouEm: null }
    })
  )

  assert.equal(t.ciclos.length, 1)
  assert.equal(t.ciclos[0].periodo, '2412')
  assert.equal(t.ciclos[0].anos, 2)
  assert.deepEqual(t.ciclos[0].coortes.map((c) => c.periodo), ['2412', '2512'])
  assert.deepEqual(t.ciclos[0].coortes.map((c) => c.ano), [1, 2])
  assert.equal(t.ciclos[0].coortes[0].tag?.id, '10')
  assert.equal(t.ciclos[0].coortes[1].tag?.id, '11')
  assert.equal(t.ciclos[0].turma?.classId, 'c')
  assert.equal(t.tagsOrfas.length, 0)
  assert.ok(!t.ciclos[0].alertas.includes('sem-tag'))
  assert.ok(!t.ciclos[0].alertas.includes('sem-tag-ano-2'))
  assert.ok(!t.ciclos[0].alertas.includes('tag-tardia'))
})

test('ciclo de 2 anos sem a tag do ano 2 leva o alerta proprio', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2024-12-03T00:00:00Z'), priceValue: 99, transaction: 'A' }),
        venda({
          approvedDate: new Date('2024-12-03T00:10:00Z'),
          priceValue: 97,
          transaction: 'B',
          hotmartProductId: '3100292'
        })
      ],
      tags: [
        { tagId: '10', nome: 'Aluno OGI L2411 - Turma 12', aplicadaEm: null }
      ],
      turmaAtual: { classId: 'c', className: 'Turma 12 | 2411', entrouEm: null }
    })
  )
  assert.equal(t.ciclos[0].coortes[1].tag, null)
  assert.ok(t.ciclos[0].alertas.includes('sem-tag-ano-2'))
  assert.ok(!t.ciclos[0].alertas.includes('sem-tag'))
})

test('ciclo sem mudanca de turma: 3 compras, 1 turma so', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2023-11-06T00:00:00Z'), transaction: 'A' }),
        venda({ approvedDate: new Date('2024-11-05T00:00:00Z'), transaction: 'B' }),
        venda({ approvedDate: new Date('2025-11-30T00:00:00Z'), transaction: 'C' })
      ],
      tags: [
        { tagId: '1', nome: 'Aluno OGI L2311 - Turma 7', aplicadaEm: new Date('2023-11-06T00:00:00Z') }
      ],
      turmaAtual: { classId: 'c1', className: 'Turma 7 | 2311', entrouEm: new Date('2023-11-06T00:00:00Z') }
    })
  )
  assert.equal(t.ciclos.length, 3)
  assert.ok(t.ciclos[1].alertas.includes('sem-mudanca-turma'))
  assert.ok(t.ciclos[1].alertas.includes('sem-tag'))
  assert.equal(t.cadeia.ciclosSemMudancaTurma, 2)
})

test('tag tardia: cdate a 14 meses da compra (carimbo de 2026-08-07)', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-05-19T00:00:00Z'), transaction: 'A' })],
      tags: [
        { tagId: '9', nome: 'Aluno OGI L2505 - Turma 14', aplicadaEm: new Date('2026-08-07T00:00:00Z') }
      ],
      turmaAtual: { classId: 'c', className: 'Turma 14 | 2505', entrouEm: null }
    })
  )
  assert.equal(t.ciclos.length, 1)
  assert.equal(t.ciclos[0].coortes[0].tag?.id, '9')
  assert.ok(t.ciclos[0].alertas.includes('tag-tardia'))
})

test('a tag do ano 2 chega um ano depois e isso nao e tardio', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2024-12-03T00:00:00Z'), priceValue: 99, transaction: 'A' }),
        venda({
          approvedDate: new Date('2024-12-03T00:10:00Z'),
          priceValue: 97,
          transaction: 'B',
          hotmartProductId: '3100292'
        })
      ],
      tags: [
        { tagId: '10', nome: 'Aluno OGI L2411 - Turma 12', aplicadaEm: new Date('2024-12-03T00:00:00Z') },
        { tagId: '11', nome: 'Aluno OGI 2511 - Renovação Turma 12', aplicadaEm: new Date('2025-12-04T00:00:00Z') }
      ],
      turmaAtual: { classId: 'c', className: 'Turma Renovação | 2601', entrouEm: null }
    })
  )
  // 366 dias depois da compra, mas só 1 dia depois do início da
  // coorte do ano 2 — medir contra a compra dava um falso alarme.
  assert.ok(!t.ciclos[0].alertas.includes('tag-tardia'))
})

test('tag orfa: tag de renovacao sem compra que a justifique', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-05-19T00:00:00Z'), transaction: 'A' })],
      tags: [
        { tagId: '9', nome: 'Aluno OGI L2505 - Turma 14', aplicadaEm: null },
        { tagId: '10', nome: 'Aluno OGI 2607 - Renovação Turma 6', aplicadaEm: new Date('2026-07-02T00:00:00Z') }
      ],
      turmaAtual: { classId: 'c', className: 'Turma 14 | 2505', entrouEm: null }
    })
  )
  assert.equal(t.tagsOrfas.length, 1)
  assert.equal(t.tagsOrfas[0].id, '10')
  assert.equal(t.tagsOrfas[0].periodo, '2607')
})

test('tags de estado ficam a parte e nunca entram em ciclos', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-05-19T00:00:00Z'), transaction: 'A' })],
      tags: [
        { tagId: '347', nome: 'Alunos OGI Ativos', aplicadaEm: new Date('2025-05-20T00:00:00Z') },
        { tagId: '676', nome: 'OGI - Aluno ou Ex-Aluno', aplicadaEm: null },
        { tagId: '9', nome: 'Aluno OGI L2505 - Turma 14', aplicadaEm: null }
      ],
      turmaAtual: { classId: 'c', className: 'Turma 14 | 2505', entrouEm: null }
    })
  )
  assert.deepEqual(t.tagsEstado.map((x) => x.id).sort(), ['347', '676'])
  assert.equal(t.tagsOrfas.length, 0)
  assert.equal(t.ciclos[0].coortes[0].tag?.id, '9')
})

test('compra sem tag: ciclo pago e nao marcado', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-07-03T00:00:00Z'), transaction: 'A' })],
      tags: [],
      turmaAtual: { classId: 'c', className: 'Turma Renovação | 2607', entrouEm: null }
    })
  )
  assert.ok(t.ciclos[0].alertas.includes('sem-tag'))
  assert.equal(t.ciclos[0].tagEsperada, 'Aluno OGI 2607 - Renovação')
})

test('turma sem mapa: alerta tag-por-definir e entrada em turmasPorMapear', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-05-04T00:00:00Z'), transaction: 'A' })],
      tags: [],
      turmaAtual: { classId: 'c', className: 'Turmas 1, 2 e 3 [3a renov] | 2605', entrouEm: null }
    })
  )
  assert.ok(t.ciclos[0].alertas.includes('tag-por-definir'))
  assert.deepEqual(t.turmasPorMapear, ['Turmas 1, 2 e 3 [3a renov] | 2605'])
  assert.equal(t.cadeia.tagIgualTurma, 'sem-dados')
})

test('tag diferente da turma: a turma diz uma coisa, a tag diz outra', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-06-10T00:00:00Z'), transaction: 'A' })],
      tags: [
        { tagId: '684', nome: 'Aluno OGI 2607 - Renovação Turma 6', aplicadaEm: new Date('2026-06-11T00:00:00Z') }
      ],
      turmaAtual: { classId: 'c', className: 'Turma Renovação | 2606', entrouEm: null }
    })
  )
  assert.equal(t.ciclos[0].coortes[0].tag?.id, '684')
  assert.equal(t.ciclos[0].tagEsperada, 'Aluno OGI 2606 - Renovação')
  assert.ok(t.ciclos[0].alertas.includes('tag-diferente-da-turma'))
  assert.equal(t.cadeia.tagIgualTurma, 'divergente')
})

test('reembolso: sem ciclos e sem alertas inventados', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-05-25T00:00:00Z'), transactionStatus: 'REFUNDED' })],
      tags: [],
      turmaAtual: { classId: 'c', className: 'Turma 18 | 2605', entrouEm: null }
    })
  )
  assert.equal(t.ciclos.length, 0)
  assert.equal(t.cadeia.acCompraIgualUltimaVenda, 'sem-dados')
  assert.equal(t.cadeia.tagIgualTurma, 'sem-dados')
})

test('expiracao divergente da turma marca a cadeia', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-09-10T00:00:00Z'), transaction: 'A' })],
      tags: [{ tagId: '1', nome: 'Aluno OGI L2509 - Turma 15', aplicadaEm: null }],
      turmaAtual: { classId: 'c', className: 'Turma 15 | 2509', entrouEm: null },
      acExpiracao: new Date('2026-08-31T00:00:00Z')
    })
  )
  assert.equal(t.cadeia.expiracaoIgualTurma, 'divergente')
})

test('venda posterior a sync de tags levanta a bandeira de desactualizado', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-08-20T00:00:00Z'), transaction: 'A' })],
      tags: [],
      turmaAtual: null,
      fontes: { vendas: AGORA, tags: new Date('2026-08-01T00:00:00Z'), ac: AGORA }
    })
  )
  assert.equal(t.cadeia.tagsDesatualizadas, true)
})

test('correr duas vezes da exactamente o mesmo resultado', () => {
  const e = entrada({
    vendas: [venda({ approvedDate: new Date('2025-11-30T00:00:00Z'), transaction: 'C' })],
    tags: [{ tagId: '3', nome: 'Aluno OGI 2511 - Renovação Turma 7', aplicadaEm: null }],
    turmaAtual: { classId: 'c3', className: 'Turma 7 [2a renov] | 2511', entrouEm: null }
  })
  assert.deepEqual(JSON.parse(JSON.stringify(gerarTimeline(e))), JSON.parse(JSON.stringify(gerarTimeline(e))))
})

test('a ordem das tags a entrada nao muda o resultado', () => {
  const base = {
    vendas: [
      venda({ approvedDate: new Date('2023-11-06T00:00:00Z'), transaction: 'A' }),
      venda({ approvedDate: new Date('2024-11-05T00:00:00Z'), transaction: 'B' })
    ],
    turmaAtual: { classId: 'c', className: 'Turma 7 [renov] | 2411', entrouEm: null }
  }
  const t1 = gerarTimeline(entrada({ ...base, tags: [
    { tagId: '1', nome: 'Aluno OGI L2311 - Turma 7', aplicadaEm: null },
    { tagId: '2', nome: 'Aluno OGI 2411 - Renovação Turma 7', aplicadaEm: null }
  ] }))
  const t2 = gerarTimeline(entrada({ ...base, tags: [
    { tagId: '2', nome: 'Aluno OGI 2411 - Renovação Turma 7', aplicadaEm: null },
    { tagId: '1', nome: 'Aluno OGI L2311 - Turma 7', aplicadaEm: null }
  ] }))
  assert.deepEqual(
    t1.ciclos.map((c) => c.coortes[0].tag?.id),
    t2.ciclos.map((c) => c.coortes[0].tag?.id)
  )
  assert.deepEqual(t1.ciclos.map((c) => c.coortes[0].tag?.id), ['1', '2'])
})
