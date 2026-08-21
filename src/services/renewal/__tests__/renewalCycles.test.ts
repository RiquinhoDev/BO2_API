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
