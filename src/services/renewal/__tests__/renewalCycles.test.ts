import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparCiclos, periodoDeData, indiceDePeriodo, fimDoMes } from '../renewalCycles'
import type { VendaEntrada } from '../renewalTimeline.types'

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

test('periodoDeData devolve YYMM', () => {
  assert.equal(periodoDeData(new Date('2025-11-30T10:00:00Z')), '2511')
  assert.equal(periodoDeData(new Date('2026-01-02T23:00:00Z')), '2601')
})

test('cada compra do ciclo conserva paymentMode e offerCode para o reconciliador', () => {
  const ciclos = agruparCiclos([
    venda({
      approvedDate: new Date('2026-08-01T00:00:00Z'),
      offerCode: 'base-397',
      paymentMode: 'PAY_IN_FULL',
      transaction: 'BASE'
    }),
    venda({
      approvedDate: new Date('2026-08-07T00:00:00Z'),
      hotmartProductId: '3100292',
      offerCode: 'extensao-97',
      paymentMode: 'PAY_IN_FULL',
      transaction: 'EXT'
    })
  ])

  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].compras[0].offerCode, 'base-397')
  assert.equal(ciclos[0].compras[0].paymentMode, 'PAY_IN_FULL')
  assert.equal(ciclos[0].compras[1].offerCode, 'extensao-97')
  assert.equal(ciclos[0].compras[1].paymentMode, 'PAY_IN_FULL')
})

test('indiceDePeriodo ordena meses e rejeita lixo', () => {
  const a = indiceDePeriodo('2512')!
  const b = indiceDePeriodo('2601')!
  assert.equal(b - a, 1)
  assert.equal(indiceDePeriodo('2513'), null)
  assert.equal(indiceDePeriodo('abc'), null)
})

test('fimDoMes devolve o último instante do mês em UTC', () => {
  assert.equal(fimDoMes(2026, 2).toISOString(), '2026-02-28T23:59:59.999Z')
})

test('percurso limpo: 3 compras anuais dao 3 ciclos de 1 ano', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2023-11-06T00:00:00Z'), priceValue: 389, transaction: 'T1' }),
    venda({ approvedDate: new Date('2024-11-05T00:00:00Z'), priceValue: 142, transaction: 'T2' }),
    venda({ approvedDate: new Date('2025-11-30T00:00:00Z'), priceValue: 145, transaction: 'T3' })
  ])
  assert.equal(ciclos.length, 3)
  assert.deepEqual(ciclos.map((c) => c.periodo), ['2311', '2411', '2511'])
  assert.deepEqual(ciclos.map((c) => c.anos), [1, 1, 1])
  assert.equal(ciclos[2].acessoAte.toISOString(), '2026-11-30T23:59:59.999Z')
})

test('extensao de 2 anos: 167 mais 97 no mesmo dia sao um ciclo de 2 anos', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2024-08-18T09:00:00Z'), priceValue: 167, transaction: 'A' }),
    venda({
      approvedDate: new Date('2024-08-18T09:02:00Z'),
      priceValue: 97,
      transaction: 'B',
      hotmartProductId: '3100292'
    })
  ])
  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].compras.length, 2)
  assert.equal(ciclos[0].anos, 2)
  assert.equal(ciclos[0].compras[1].extensao, true)
  assert.equal(ciclos[0].acessoAte.toISOString(), '2026-08-31T23:59:59.999Z')
})

test('paulo: extensao sete dias depois acompanha a compra e da dois anos', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2024-11-25T00:00:00Z'), priceValue: 397, transaction: 'PAULO-BASE' }),
    venda({
      approvedDate: new Date('2024-12-02T00:00:00Z'),
      priceValue: 97,
      transaction: 'PAULO-EXT',
      hotmartProductId: '3100292'
    })
  ])

  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].compras.length, 2)
  assert.equal(ciclos[0].anos, 2)
  assert.equal(ciclos[0].acessoAte.toISOString(), '2026-11-30T23:59:59.999Z')
})

test('n510: extensao no dia seguinte acompanha a compra e da dois anos', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2025-05-07T00:00:00Z'), priceValue: 167, transaction: 'N510-BASE' }),
    venda({
      approvedDate: new Date('2025-05-08T00:00:00Z'),
      priceValue: 97,
      transaction: 'N510-EXT',
      hotmartProductId: '3100292'
    })
  ])

  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].compras.length, 2)
  assert.equal(ciclos[0].anos, 2)
})

test('maria: extensao de 85 euros no dia seguinte acompanha a compra e da dois anos', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2023-07-10T00:00:00Z'), priceValue: 302, transaction: 'MARIA-BASE' }),
    venda({
      approvedDate: new Date('2023-07-11T00:00:00Z'),
      priceValue: 85,
      transaction: 'MARIA-EXT',
      hotmartProductId: '3100292'
    })
  ])

  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].compras.length, 2)
  assert.equal(ciclos[0].anos, 2)
})

test('uma compra normal ate sete dias depois continua a abrir outro ciclo', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2025-05-07T00:00:00Z'), priceValue: 167, transaction: 'BASE' }),
    venda({ approvedDate: new Date('2025-05-08T00:00:00Z'), priceValue: 97, transaction: 'NORMAL' })
  ])

  assert.equal(ciclos.length, 2)
  assert.deepEqual(ciclos.map((c) => c.anos), [1, 1])
})

test('extensao sozinha vale um ano, nao dois', () => {
  const ciclos = agruparCiclos([
    venda({
      approvedDate: new Date('2025-03-10T00:00:00Z'),
      priceValue: 97,
      transaction: 'X',
      hotmartProductId: '3100292'
    })
  ])
  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].anos, 1)
})

test('prestacoes: 5 x 99 na mesma oferta sao um ciclo so, contado da primeira', () => {
  const meses = ['2025-12-04', '2026-01-04', '2026-02-04', '2026-03-04', '2026-04-04']
  const ciclos = agruparCiclos(
    meses.map((d, i) =>
      venda({
        approvedDate: new Date(`${d}T00:00:00Z`),
        priceValue: 99,
        offerCode: 'sub99',
        transaction: `P${i}`
      })
    )
  )
  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].periodo, '2512')
  assert.equal(ciclos[0].compras.length, 5)
  assert.equal(ciclos[0].acessoAte.toISOString(), '2026-12-31T23:59:59.999Z')
})

test('renovacao anual na mesma oferta nao e confundida com prestacao', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2025-02-24T00:00:00Z'), priceValue: 167, offerCode: 'ren', transaction: 'A' }),
    venda({ approvedDate: new Date('2026-02-24T00:00:00Z'), priceValue: 167, offerCode: 'ren', transaction: 'B' })
  ])
  assert.equal(ciclos.length, 2)
})

test('renovacao anual antecipada nao e absorvida como prestacao', () => {
  // happyhome.carla: 23/01/2024 e 17/12/2024, mesma oferta, 49€ cada,
  // 329 dias — duas renovações, não uma prestação.
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2024-01-23T00:00:00Z'), priceValue: 49, offerCode: 'b9grqqzt', transaction: 'A' }),
    venda({ approvedDate: new Date('2024-12-17T00:00:00Z'), priceValue: 49, offerCode: 'b9grqqzt', transaction: 'B' })
  ])
  assert.equal(ciclos.length, 2)
})

test('prestacoes com cobrancas atrasadas continuam um ciclo so', () => {
  // kukuruzickosa: 90€ em prestações com falhas pelo meio — entre
  // cobranças bem sucedidas chega a haver 59 dias.
  //
  // Não é regressão da regra antiga (estas cabiam nos 335 dias
  // contados da âncora): guarda a correcção pela metade, em que
  // alguém baixasse o corte para 90 sem mudar o ponto de medida —
  // aí a compra de Agosto ficaria a 125 dias da âncora e partia o
  // ciclo em dois.
  const datas = ['2026-03-31', '2026-05-01', '2026-06-05', '2026-08-03']
  const ciclos = agruparCiclos(
    datas.map((d, i) =>
      venda({ approvedDate: new Date(`${d}T00:00:00Z`), priceValue: 90, offerCode: 'gyar28ac', transaction: `K${i}` })
    )
  )
  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].periodo, '2603')
})

test('a corrente de prestacoes nao estica para alem de um ano', () => {
  // cada cobrança a 85 dias da anterior — todas passam o corte dos
  // 90 — mas a quinta cai a 340 dias da âncora, e um plano de
  // prestações não dura mais de um ano.
  const dias = [0, 85, 170, 255, 340]
  const base = Date.UTC(2025, 0, 10)
  const ciclos = agruparCiclos(
    dias.map((d, i) =>
      venda({
        approvedDate: new Date(base + d * 86400000),
        priceValue: 60,
        offerCode: 'longa',
        transaction: `L${i}`
      })
    )
  )
  assert.equal(ciclos.length, 2)
  assert.equal(ciclos[0].compras.length, 4)
  assert.equal(ciclos[1].compras.length, 1)
})

test('reembolso nao gera ciclo', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2026-05-25T00:00:00Z'), transactionStatus: 'REFUNDED' }),
    venda({ approvedDate: new Date('2026-05-26T00:00:00Z'), transactionStatus: 'EXPIRED' }),
    venda({ approvedDate: new Date('2026-05-27T00:00:00Z'), transactionStatus: 'COMPLETE', transaction: 'OK' })
  ])
  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].compras[0].transacao, 'OK')
})

test('venda sem data nenhuma e ignorada, e orderDate serve de recurso', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: null, orderDate: null, transaction: 'SEM' }),
    venda({ approvedDate: null, orderDate: new Date('2025-06-03T00:00:00Z'), transaction: 'COM' })
  ])
  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].compras[0].transacao, 'COM')
})

test('plano de prestacoes com falhas e valores diferentes fica um ciclo', () => {
  // cm.love.ar: comprou em Maio/2025 a pagar em prestacoes, falhou as de
  // Setembro e recuperou a 18/01/2026 — 150 dias depois da ultima boa e
  // com outro valor (cambio USD). Sao a mesma oferta e o mesmo plano.
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2025-05-21T00:00:00Z'), priceValue: 118.31, currency: 'USD', offerCode: 'tvqaads3', paymentMode: 'MULTIPLE_PAYMENTS', transaction: 'A' }),
    venda({ approvedDate: new Date('2025-06-21T00:00:00Z'), priceValue: 118.31, currency: 'USD', offerCode: 'tvqaads3', paymentMode: 'MULTIPLE_PAYMENTS', transaction: 'B' }),
    venda({ approvedDate: new Date('2025-08-21T00:00:00Z'), priceValue: 118.31, currency: 'USD', offerCode: 'tvqaads3', paymentMode: 'MULTIPLE_PAYMENTS', transaction: 'C' }),
    venda({ approvedDate: new Date('2026-01-18T00:00:00Z'), priceValue: 145.52, currency: 'USD', offerCode: 'tvqaads3', paymentMode: 'MULTIPLE_PAYMENTS', transaction: 'D' })
  ])
  assert.equal(ciclos.length, 1)
  assert.equal(ciclos[0].periodo, '2505')
  assert.equal(ciclos[0].compras.length, 4)
})

test('duas compras a pronto na mesma oferta continuam dois ciclos', () => {
  // o marcador de prestacoes nao pode abrir a porta a fundir renovacoes:
  // PAY_IN_FULL mantem a regra antiga do valor e do intervalo.
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2025-02-24T00:00:00Z'), priceValue: 167, offerCode: 'ren', paymentMode: 'PAY_IN_FULL', transaction: 'A' }),
    venda({ approvedDate: new Date('2025-12-20T00:00:00Z'), priceValue: 167, offerCode: 'ren', paymentMode: 'PAY_IN_FULL', transaction: 'B' })
  ])
  assert.equal(ciclos.length, 2)
})

test('o tecto de um ano trava tambem o plano de prestacoes', () => {
  const ciclos = agruparCiclos([
    venda({ approvedDate: new Date('2025-01-10T00:00:00Z'), priceValue: 99, offerCode: 'sub', paymentMode: 'MULTIPLE_PAYMENTS', transaction: 'A' }),
    venda({ approvedDate: new Date('2026-01-05T00:00:00Z'), priceValue: 99, offerCode: 'sub', paymentMode: 'MULTIPLE_PAYMENTS', transaction: 'B' })
  ])
  assert.equal(ciclos.length, 2)
})
