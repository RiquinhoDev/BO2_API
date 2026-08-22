import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as acExpirationSync from '../acExpirationSync.service'
import type { VendaEntrada } from '../renewalTimeline.types'

const venda = (partial: Partial<VendaEntrada>): VendaEntrada => ({
  hotmartProductId: '1733154',
  productName: 'O Grande Investimento',
  transaction: null,
  offerCode: null,
  transactionStatus: 'APPROVED',
  approvedDate: null,
  orderDate: null,
  priceValue: 99,
  currency: 'EUR',
  ...partial
})

const dataBaseDoAluno = (acExpirationSync as unknown as { dataBaseDoAluno: (sales: VendaEntrada[]) => Date | null }).dataBaseDoAluno
const encurtaria = (acExpirationSync as unknown as { encurtaria: (calculado: Date, acTem: Date | null) => boolean }).encurtaria

test('computeExpirationFromPurchaseDate devolve o último instante do mês do ano seguinte', () => {
  const casos = [
    ['2026-08-11T12:00:00Z', '2027-08-31T23:59:59.999Z'],
    ['2026-01-31T12:00:00Z', '2027-01-31T23:59:59.999Z'],
    ['2024-02-29T12:00:00Z', '2025-02-28T23:59:59.999Z'],
    ['2026-12-15T12:00:00Z', '2027-12-31T23:59:59.999Z']
  ] as const

  for (const [compra, esperado] of casos) {
    assert.equal(acExpirationSync.computeExpirationFromPurchaseDate(new Date(compra)).toISOString(), esperado)
  }
})

test('dataBaseDoAluno devolve a compra âncora do último ciclo', () => {
  const prestacoes = ['2026-03-31', '2026-05-01', '2026-06-05', '2026-08-03'].map((data, i) =>
    venda({ approvedDate: new Date(`${data}T00:00:00Z`), offerCode: 'prestações', transaction: `P${i}` })
  )
  assert.equal(dataBaseDoAluno(prestacoes)?.toISOString(), '2026-03-31T00:00:00.000Z')

  assert.equal(
    dataBaseDoAluno([venda({ approvedDate: new Date('2026-04-15T00:00:00Z'), transaction: 'ÚNICA' })])?.toISOString(),
    '2026-04-15T00:00:00.000Z'
  )

  assert.equal(
    dataBaseDoAluno([
      venda({ approvedDate: new Date('2025-02-10T00:00:00Z'), offerCode: 'anual', transaction: '2025' }),
      venda({ approvedDate: new Date('2026-02-10T00:00:00Z'), offerCode: 'anual', transaction: '2026' })
    ])?.toISOString(),
    '2026-02-10T00:00:00.000Z'
  )

  assert.equal(dataBaseDoAluno([]), null)
  assert.equal(
    dataBaseDoAluno([venda({ approvedDate: new Date('2026-05-25T00:00:00Z'), transactionStatus: 'REFUNDED' })]),
    null
  )
})

test('encurtaria só bloqueia uma expiração calculada anterior à existente na AC', () => {
  assert.equal(encurtaria(new Date('2026-05-31T23:59:59.999Z'), new Date('2027-05-31T23:59:59.999Z')), true)
  assert.equal(encurtaria(new Date('2026-05-31T23:59:59.999Z'), new Date('2026-05-31T23:59:59.999Z')), false)
  assert.equal(encurtaria(new Date('2026-05-31T23:59:59.999Z'), null), false)
})
