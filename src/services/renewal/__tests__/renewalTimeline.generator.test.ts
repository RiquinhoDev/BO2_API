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
  // As duas coortes estão marcadas e nenhuma tag chegou tarde. Fica
  // um alerta só, e é verdadeiro: ele está na turma de renovação de
  // 2601 e nenhuma das suas tags é a dessa turma, por isso não
  // apanha a automação dela.
  assert.deepEqual(t.ciclos[0].alertas, ['tag-diferente-da-turma'])
  assert.equal(t.ciclos[0].tagEsperada, 'Aluno OGI 2601 - Renovação')
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

test('ciclo de 2 anos prefere a tag explicita 2anos quando o periodo e igual', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2025-06-03T00:00:00Z'), priceValue: 167, transaction: 'A' }),
        venda({
          approvedDate: new Date('2025-06-03T00:10:00Z'),
          priceValue: 97,
          transaction: 'B',
          hotmartProductId: '3100292'
        })
      ],
      tags: [
        { tagId: '100', nome: 'Aluno OGI 2505 - Renovação Turma 5', aplicadaEm: null },
        { tagId: '900', nome: 'Aluno OGI 2505 - Renovação Turma 5 [2anos]', aplicadaEm: null }
      ]
    })
  )

  assert.equal(t.ciclos[0].coortes[0].tag?.id, '900')
  assert.deepEqual(t.tagsOrfas, [])
  assert.deepEqual(t.tagsDuplicadas.map((tag) => tag.id), ['100'])
  assert.equal(t.tagsDuplicadas[0].coortePeriodo, '2506')
})

test('três compras e só a turma actual deixam os ciclos anteriores sem registo', () => {
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
  assert.ok(t.ciclos[0].alertas.includes('sem-registo-turma'))
  assert.ok(t.ciclos[1].alertas.includes('sem-registo-turma'))
  assert.ok(t.ciclos[1].alertas.includes('sem-tag'))
  assert.equal(t.ciclos[2].turma?.classId, 'c1')
  assert.equal(t.cadeia.ciclosSemRegistoTurma, 2)
  assert.equal(t.cadeia.ciclosSemMudancaTurma, 0)
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
  assert.equal(t.tagsDuplicadas.length, 0)
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

test('empate entre duas tags: ganha a da frente, venha na ordem que vier', () => {
  // ciclo em 2501, uma tag a 2411 (dois meses atrás) e outra a 2503
  // (dois meses à frente). Empatadas na distância — decide a regra,
  // não a ordem de chegada.
  const base = {
    vendas: [venda({ approvedDate: new Date('2025-01-15T00:00:00Z'), transaction: 'A' })],
    turmaAtual: null
  }
  const atras = { tagId: '900', nome: 'Aluno OGI L2411 - Turma 12', aplicadaEm: null }
  const frente = { tagId: '100', nome: 'Aluno OGI 2503 - Renovação', aplicadaEm: null }

  const t1 = gerarTimeline(entrada({ ...base, tags: [atras, frente] }))
  const t2 = gerarTimeline(entrada({ ...base, tags: [frente, atras] }))

  assert.equal(t1.ciclos[0].coortes[0].tag?.id, '100')
  assert.equal(t2.ciclos[0].coortes[0].tag?.id, '100')
  assert.deepEqual(t1.tagsOrfas, [])
  assert.deepEqual(t2.tagsOrfas, [])
  assert.deepEqual(t1.tagsDuplicadas.map((o) => o.id), ['900'])
  assert.deepEqual(t2.tagsDuplicadas.map((o) => o.id), ['900'])
  assert.equal(t1.tagsDuplicadas[0].coortePeriodo, '2501')
})

test('nova compra a meio de um ciclo de 2 anos ganha a tag que fica a sua frente', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2025-01-15T00:00:00Z'), transaction: 'A' }),
        venda({
          approvedDate: new Date('2025-01-15T00:10:00Z'),
          transaction: 'B',
          hotmartProductId: '3100292'
        }),
        venda({ approvedDate: new Date('2025-11-15T00:00:00Z'), transaction: 'C' })
      ],
      tags: [
        { tagId: '10', nome: 'Aluno OGI 2512 - Renovação', aplicadaEm: null }
      ]
    })
  )

  // 2512 fica um mês antes da coorte 2601 do ciclo antigo e um
  // mês depois da nova compra 2511. A nova compra é a causa mais
  // próxima no sentido normal da cadeia, por isso ganha o empate.
  assert.equal(t.ciclos[0].coortes[1].tag, null)
  assert.equal(t.ciclos[1].coortes[0].tag?.id, '10')
})

test('empate entre turmas: ganha a actual, nao a que ele ja deixou', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-01-15T00:00:00Z'), transaction: 'A' })],
      tags: [],
      movimentacoes: [{ classId: 'velha', className: 'Turma 1 | 2411', entrouEm: null }],
      turmaAtual: { classId: 'nova', className: 'Turma 2 | 2503', entrouEm: null }
    })
  )
  assert.equal(t.ciclos[0].turma?.classId, 'nova')
})

test('empate entre duas tags do MESMO periodo decide-se pelo id', () => {
  // as duas estão à mesma distância E do mesmo lado, por isso não é
  // a regra da frente que decide — é a chave do próprio candidato.
  const base = {
    vendas: [venda({ approvedDate: new Date('2025-01-15T00:00:00Z'), transaction: 'A' })],
    turmaAtual: null
  }
  const alta = { tagId: '500', nome: 'Aluno OGI 2503 - Renovação', aplicadaEm: null }
  const baixa = { tagId: '100', nome: 'Aluno OGI 2503 - Renovação Turma 5', aplicadaEm: null }

  const t1 = gerarTimeline(entrada({ ...base, tags: [alta, baixa] }))
  const t2 = gerarTimeline(entrada({ ...base, tags: [baixa, alta] }))

  assert.equal(t1.ciclos[0].coortes[0].tag?.id, '100')
  assert.equal(t2.ciclos[0].coortes[0].tag?.id, '100')
})

test('a turma actual ganha o empate mesmo vindo primeiro no historico', () => {
  // o histórico entregue do mais recente para o mais antigo, e a
  // turma actual também lá dentro — a chave tem de vir da turma,
  // não da posição, senão a antiga voltava a ganhar.
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-01-15T00:00:00Z'), transaction: 'A' })],
      tags: [],
      movimentacoes: [
        { classId: 'nova', className: 'Turma 2 | 2503', entrouEm: new Date('2025-03-01T00:00:00Z') },
        { classId: 'velha', className: 'Turma 1 | 2503', entrouEm: new Date('2024-03-01T00:00:00Z') }
      ],
      turmaAtual: { classId: 'nova', className: 'Turma 2 | 2503', entrouEm: new Date('2025-03-01T00:00:00Z') }
    })
  )
  assert.equal(t.ciclos[0].turma?.classId, 'nova')
})

test('turma actual fora da tolerancia fica no ultimo ciclo e continua reportada', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-05-19T00:00:00Z'), transaction: 'A' })],
      tags: [],
      turmaAtual: { classId: 'c', className: 'Turmas 1, 2 e 3 [3a renov] | 2601', entrouEm: null }
    })
  )
  // O período distante não apaga a turma actual, e a falta de mapa
  // mantém-se visível no ciclo e na lista global.
  assert.equal(t.ciclos[0].turma?.classId, 'c')
  assert.ok(t.ciclos[0].alertas.includes('tag-por-definir'))
  assert.deepEqual(t.turmasPorMapear, ['Turmas 1, 2 e 3 [3a renov] | 2601'])
})

test('turma historica sem mapa e fora da tolerancia continua a ser reportada', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-05-19T00:00:00Z'), transaction: 'A' })],
      tags: [],
      movimentacoes: [
        { classId: 'antiga', className: 'Turmas 1, 2 e 3 [3a renov] | 2401', entrouEm: null }
      ],
      turmaAtual: { classId: 'actual', className: 'Turma 14 | 2505', entrouEm: null }
    })
  )

  assert.deepEqual(t.turmasPorMapear, ['Turmas 1, 2 e 3 [3a renov] | 2401'])
})

test('sentinela historica sem periodo nao entra nas turmas por mapear', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-05-19T00:00:00Z'), transaction: 'A' })],
      tags: [],
      movimentacoes: [
        { classId: 'antiga', className: 'Nome não disponível', entrouEm: null }
      ],
      turmaAtual: { classId: 'actual', className: 'Turma 14 | 2505', entrouEm: null }
    })
  )

  assert.deepEqual(t.turmasPorMapear, [])
})

test('prestacoes: a AC guarda a data da COMPRA, nao da ultima cobranca', () => {
  // Medido a 22/08/2026 nos alunos activos: em 47 o campo 334 bate com a
  // ancora do ciclo e em ZERO bate com a ultima cobranca. A data de compra
  // e quando a pessoa comprou, nao quando a ultima prestacao foi cobrada.
  const meses = ['2025-12-04', '2026-01-04', '2026-02-04', '2026-03-04', '2026-04-04']
  const vendas = meses.map((d, i) =>
    venda({
      approvedDate: new Date(`${d}T00:00:00Z`),
      priceValue: 99,
      offerCode: 'sub99',
      transaction: `P${i}`
    })
  )
  const comAncora = gerarTimeline(entrada({ vendas, acDataCompra: new Date('2025-12-04T00:00:00Z') }))
  const comUltima = gerarTimeline(entrada({ vendas, acDataCompra: new Date('2026-04-04T00:00:00Z') }))

  assert.equal(comAncora.cadeia.acCompraIgualUltimaVenda, 'ok')
  assert.equal(comUltima.cadeia.acCompraIgualUltimaVenda, 'divergente')
  assert.equal(comAncora.cadeia.comparacoes.acCompra.esperado?.toISOString(), '2025-12-04T00:00:00.000Z')
})

test('a cadeia guarda os dois lados de cada comparacao', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2023-11-06T00:00:00Z'), transaction: 'A' }),
        venda({ approvedDate: new Date('2024-11-05T00:00:00Z'), transaction: 'B' }),
        venda({ approvedDate: new Date('2025-11-30T00:00:00Z'), transaction: 'C' })
      ],
      tags: [
        { tagId: '1', nome: 'Aluno OGI L2311 - Turma 7', aplicadaEm: null },
        { tagId: '2', nome: 'Aluno OGI 2411 - Renovação Turma 7', aplicadaEm: null },
        { tagId: '3', nome: 'Aluno OGI 2511 - Renovação Turma 7', aplicadaEm: null }
      ],
      turmaAtual: { classId: 'c3', className: 'Turma 7 [2a renov] | 2511', entrouEm: null },
      movimentacoes: [
        { classId: 'c1', className: 'Turma 7 | 2311', entrouEm: null },
        { classId: 'c2', className: 'Turma 7 [renov] | 2411', entrouEm: null }
      ],
      acDataCompra: new Date('2025-11-30T00:00:00Z'),
      acExpiracao: new Date('2026-11-30T00:00:00Z')
    })
  )

  const c = t.cadeia.comparacoes
  assert.equal(c.acCompra.esperado?.toISOString(), '2025-11-30T00:00:00.000Z')
  assert.equal(c.acCompra.encontrado?.toISOString(), '2025-11-30T00:00:00.000Z')
  assert.equal(c.expiracao.esperado?.toISOString(), '2026-11-30T23:59:59.999Z')
  assert.equal(c.expiracao.encontrado?.toISOString(), '2026-11-30T00:00:00.000Z')
  assert.equal(c.tag.esperado, 'Aluno OGI 2511 - Renovação Turma 7')
  assert.equal(c.tag.encontrado, 'Aluno OGI 2511 - Renovação Turma 7')
  assert.deepEqual(c.ciclosComTurma, { esperado: 3, encontrado: 3 })
})

test('numa divergencia a comparacao diz de que valores se trata', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-06-10T00:00:00Z'), transaction: 'A' })],
      tags: [
        { tagId: '684', nome: 'Aluno OGI 2607 - Renovação Turma 6', aplicadaEm: null }
      ],
      turmaAtual: { classId: 'c', className: 'Turma Renovação | 2606', entrouEm: null }
    })
  )
  assert.equal(t.cadeia.tagIgualTurma, 'divergente')
  assert.equal(t.cadeia.comparacoes.tag.esperado, 'Aluno OGI 2606 - Renovação')
  assert.equal(t.cadeia.comparacoes.tag.encontrado, 'Aluno OGI 2607 - Renovação Turma 6')
})

test('ciclos sem turma aparecem na contagem da comparacao', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2023-11-06T00:00:00Z'), transaction: 'A' }),
        venda({ approvedDate: new Date('2024-11-05T00:00:00Z'), transaction: 'B' }),
        venda({ approvedDate: new Date('2025-11-30T00:00:00Z'), transaction: 'C' })
      ],
      tags: [],
      turmaAtual: { classId: 'c1', className: 'Turma 7 | 2311', entrouEm: null }
    })
  )
  assert.deepEqual(t.cadeia.comparacoes.ciclosComTurma, { esperado: 3, encontrado: 1 })
  assert.equal(t.cadeia.ciclosSemRegistoTurma, 2)
  assert.equal(t.cadeia.ciclosSemMudancaTurma, 0)
})

test('sem turma conhecida antes, o alerta e de falta de registo', () => {
  // o guirod13: comprou em 2409 e em 2509, mas a BD so conhece a turma
  // de 2509 e o historico dele esta vazio. Nao ficou na mesma turma —
  // nao sabemos em que turma esteve no primeiro ciclo.
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2024-09-16T00:00:00Z'), transaction: 'A' }),
        venda({ approvedDate: new Date('2025-09-05T00:00:00Z'), transaction: 'B' })
      ],
      tags: [
        { tagId: '1', nome: 'Aluno OGI L2409 - Turma 11', aplicadaEm: null },
        { tagId: '2', nome: 'Aluno OGI 2509 - Renovação Turma 11', aplicadaEm: null }
      ],
      turmaAtual: { classId: 'c', className: 'Turma 11 [renov] + REITs | 2509', entrouEm: null }
    })
  )

  assert.deepEqual(t.ciclos[0].alertas, ['sem-registo-turma'])
  assert.deepEqual(t.ciclos[1].alertas, [])
  assert.equal(t.cadeia.ciclosSemRegistoTurma, 1)
  assert.equal(t.cadeia.ciclosSemMudancaTurma, 0)
  // lacuna de registo nossa nao e desvio do aluno
  assert.equal(t.cadeia.registoDeTurmas, 'sem-dados')
})

test('uma única turma actual ocupa só o último ciclo', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2023-11-06T00:00:00Z'), transaction: 'A' }),
        venda({ approvedDate: new Date('2024-11-05T00:00:00Z'), transaction: 'B' })
      ],
      tags: [],
      turmaAtual: { classId: 'c1', className: 'Turma 7 | 2311', entrouEm: null }
    })
  )

  assert.ok(t.ciclos[0].alertas.includes('sem-tag'))
  assert.equal(t.ciclos[0].turma, null)
  assert.ok(t.ciclos[0].alertas.includes('sem-registo-turma'))
  assert.equal(t.ciclos[1].turma?.classId, 'c1')
  assert.ok(!t.ciclos[1].alertas.includes('sem-mudanca-turma'))
  assert.equal(t.cadeia.ciclosSemMudancaTurma, 0)
  assert.equal(t.cadeia.ciclosSemRegistoTurma, 1)
  assert.equal(t.cadeia.registoDeTurmas, 'sem-dados')
})

test('todos os ciclos com turma dao veredicto correto', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-09-10T00:00:00Z'), transaction: 'A' })],
      tags: [],
      turmaAtual: { classId: 'c', className: 'Turma 15 | 2509', entrouEm: null }
    })
  )
  assert.equal(t.cadeia.registoDeTurmas, 'ok')
})
test('ter a tag certa noutra coorte nao e divergencia', () => {
  // Caso real: 12 de 12 alunos da Turma 8 | 2601 tem a tag da turma,
  // mas o emparelhamento e um-para-um e a coorte ficou com outra tag
  // do mesmo periodo. Perguntar "a coorte tem esta tag?" acusava-os;
  // a pergunta certa e "o aluno tem esta tag?".
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-01-20T00:00:00Z'), transaction: 'A' })],
      tags: [
        { tagId: '100', nome: 'Aluno OGI 2601 - Renovação Turma 4', aplicadaEm: null },
        { tagId: '500', nome: 'Aluno OGI 2601 - Renovação Turma 8', aplicadaEm: null }
      ],
      turmaAtual: { classId: 'c', className: 'Turma 8 [2a renov] | 2601', entrouEm: null }
    })
  )

  assert.equal(t.ciclos[0].tagEsperada, 'Aluno OGI 2601 - Renovação Turma 8')
  // o desempate por id deu a coorte a tag da Turma 4
  assert.equal(t.ciclos[0].coortes[0].tag?.id, '100')
  // mas o aluno tem a da Turma 8, por isso nao ha divergencia
  assert.ok(!t.ciclos[0].alertas.includes('tag-diferente-da-turma'))
  assert.equal(t.cadeia.tagIgualTurma, 'ok')
  // e a comparacao mostra as duas iguais em vez de acusar sem razao
  assert.equal(t.cadeia.comparacoes.tag.encontrado, 'Aluno OGI 2601 - Renovação Turma 8')
})

test('nao ter a tag em lado nenhum continua a ser divergencia', () => {
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-01-20T00:00:00Z'), transaction: 'A' })],
      tags: [
        { tagId: '100', nome: 'Aluno OGI 2601 - Renovação Turma 4', aplicadaEm: null }
      ],
      turmaAtual: { classId: 'c', className: 'Turma 8 [2a renov] | 2601', entrouEm: null }
    })
  )
  assert.ok(t.ciclos[0].alertas.includes('tag-diferente-da-turma'))
  assert.equal(t.cadeia.tagIgualTurma, 'divergente')
  assert.equal(t.cadeia.comparacoes.tag.encontrado, 'Aluno OGI 2601 - Renovação Turma 4')
})
test('num ciclo de 2 anos a turma actual ganha a do historico', () => {
  // gaelle.pires: comprou 2 anos em Jan/2025 e esta na turma de 2 anos
  // de 2501. Foi movida para a de 2601 a 24/01/2026 e devolvida a 26/01.
  // A coorte do ano 2 (2601) apanhava a turma do historico e a tag
  // esperada saia dai — acusando-a de um desvio que nao tem.
  const t = gerarTimeline(
    entrada({
      vendas: [
        venda({ approvedDate: new Date('2025-01-17T00:00:00Z'), priceValue: 147, transaction: 'A' }),
        venda({
          approvedDate: new Date('2025-01-17T00:10:00Z'),
          priceValue: 97,
          transaction: 'B',
          hotmartProductId: '3100292'
        })
      ],
      tags: [
        { tagId: '1', nome: 'Aluno OGI 2501 - Renovação Turma 8 [2anos]', aplicadaEm: null }
      ],
      movimentacoes: [
        {
          classId: 'velha',
          className: 'Turma 8 [2a renov] + REITs | 2601',
          entrouEm: new Date('2026-01-24T00:00:00Z')
        }
      ],
      turmaAtual: {
        classId: 'actual',
        className: 'Turma 8 [renov] + REITs + [2 anos] | 2501',
        entrouEm: new Date('2025-01-17T00:00:00Z')
      }
    })
  )

  assert.equal(t.ciclos.length, 1)
  assert.equal(t.ciclos[0].anos, 2)
  assert.deepEqual(t.ciclos[0].coortes.map((c) => c.periodo), ['2501', '2601'])
  // a coorte do ano 2 apanha a turma do historico, mas o ciclo fica com a actual
  assert.equal(t.ciclos[0].turma?.classId, 'actual')
  assert.equal(t.ciclos[0].tagEsperada, 'Aluno OGI 2501 - Renovação Turma 8 [2anos]')
  assert.ok(!t.ciclos[0].alertas.includes('tag-diferente-da-turma'))
  assert.equal(t.cadeia.tagIgualTurma, 'ok')
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

test('a turma actual fica no ultimo ciclo mesmo vindo de mais longe', () => {
  // simaoleal94: comprou a preco cheio em Agosto (ciclo 2608), passou por
  // uma turma de renovacao e esta hoje na Turma 19, que e a coorte de
  // Outubro. A turma do historico estava a distancia 0 do ciclo e ficava
  // com o lugar; a actual, a 2 meses, era ignorada.
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-08-06T00:00:00Z'), priceValue: 397, transaction: 'A' })],
      tags: [{ tagId: '633', nome: 'Aluno OGI 2610 - Turma 19', aplicadaEm: null }],
      movimentacoes: [
        { classId: 'velha', className: 'Turma Renovação | 2608', entrouEm: new Date('2026-08-06T00:00:00Z') }
      ],
      turmaAtual: { classId: 'actual', className: 'Turma 19 | 2610', entrouEm: null }
    })
  )

  assert.equal(t.ciclos.length, 1)
  assert.equal(t.ciclos[0].turma?.classId, 'actual')
  assert.equal(t.ciclos[0].tagEsperada, 'Aluno OGI L2610 - Turma 19')
})

test('quem compra 3 meses antes de a turma base abrir fica emparelhado', () => {
  // franciscovintem19: comprou a 29/07/2026 e a Turma 19 e a coorte de
  // Outubro. Dez alunos fizeram o mesmo entre 2506 e a turma de 2509.
  // Com a janela simetrica de 2 meses ficavam marcados como sem tag.
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-07-29T00:00:00Z'), priceValue: 397, transaction: 'A' })],
      tags: [{ tagId: '633', nome: 'Aluno OGI 2610 - Turma 19', aplicadaEm: null }],
      turmaAtual: { classId: 'c', className: 'Turma 19 | 2610', entrouEm: null }
    })
  )
  assert.equal(t.ciclos[0].coortes[0].tag?.id, '633')
  assert.equal(t.ciclos[0].turma?.classId, 'c')
  assert.ok(!t.ciclos[0].alertas.includes('sem-tag'))
})

test('turma actual de periodo muito distante fica no ultimo ciclo e mostra o desvio', () => {
  // Se a regra voltar a limitar a turma actual pela distância, ela deixa
  // de chegar ao ciclo e esconde tanto a turma como a comparação da tag.
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2025-01-15T00:00:00Z'), transaction: 'A' })],
      tags: [{ tagId: '1', nome: 'Aluno OGI 2501 - Renovação', aplicadaEm: null }],
      turmaAtual: { classId: 'actual', className: 'Turma Renovação | 2606', entrouEm: null }
    })
  )

  assert.equal(t.ciclos[0].turma?.classId, 'actual')
  assert.equal(t.ciclos[0].tagEsperada, 'Aluno OGI 2606 - Renovação')
  assert.equal(t.cadeia.tagIgualTurma, 'divergente')
  assert.deepEqual(t.cadeia.comparacoes.tag, {
    esperado: 'Aluno OGI 2606 - Renovação',
    encontrado: 'Aluno OGI 2501 - Renovação'
  })
  assert.deepEqual(t.cadeia.comparacoes.ciclosComTurma, { esperado: 1, encontrado: 1 })
})

test('para tras a janela continua apertada', () => {
  // entrar numa coorte ja aberta e outra coisa: dois meses e o limite.
  // Uma tag tres meses ANTES da compra nao pertence aquele ciclo.
  const t = gerarTimeline(
    entrada({
      vendas: [venda({ approvedDate: new Date('2026-06-10T00:00:00Z'), transaction: 'A' })],
      tags: [{ tagId: '9', nome: 'Aluno OGI 2603 - Renovação Turma 9', aplicadaEm: null }],
      turmaAtual: null
    })
  )
  assert.equal(t.ciclos[0].coortes[0].tag, null)
  assert.deepEqual(t.tagsOrfas.map((o) => o.id), ['9'])
})
