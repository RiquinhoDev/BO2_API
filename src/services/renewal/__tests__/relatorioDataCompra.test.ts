import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  construirLinhasRelatorioDataCompra,
  filtrarEntradasAcAtivas,
  gerarCsvRelatorioDataCompra
} from '../../../../scripts/relatorio-data-compra'

const venda = (dados: Partial<{
  hotmartProductId: string | null
  productName: string | null
  transaction: string | null
  offerCode: string | null
  transactionStatus: string | null
  approvedDate: Date | null
  orderDate: Date | null
  priceValue: number | null
  currency: string | null
  paymentMode: string | null
}> = {}) => ({
  hotmartProductId: '1733154',
  productName: 'O Grande Investimento',
  transaction: null,
  offerCode: null,
  transactionStatus: 'APPROVED',
  approvedDate: null,
  orderDate: null,
  priceValue: 397,
  currency: 'EUR',
  paymentMode: 'PAY_IN_FULL',
  ...dados
})

test('lista a ultima cobrança, preserva a primeira compra e exclui AC alinhada no dia UTC', () => {
  const linhas = construirLinhasRelatorioDataCompra(
    [
      {
        userId: 'carimbo',
        email: 'zeta,"especial"@example.com',
        purchaseDate: new Date('2026-08-07T12:00:00.000Z'),
        firstPurchaseDate: new Date('2025-01-03T09:00:00.000Z')
      },
      {
        userId: 'normal',
        email: 'ana@example.com',
        purchaseDate: new Date('2025-02-28T00:00:00.000Z'),
        firstPurchaseDate: null
      },
      {
        userId: 'alinhada',
        email: 'alinhada@example.com',
        purchaseDate: new Date('2026-06-10T23:59:59.000Z'),
        firstPurchaseDate: null
      },
      {
        userId: 'sem-334',
        email: 'bruno@example.com',
        purchaseDate: null,
        firstPurchaseDate: null
      },
      {
        userId: 'sem-data',
        email: 'sem-data@example.com',
        purchaseDate: new Date('2025-01-01T00:00:00.000Z'),
        firstPurchaseDate: null
      }
    ],
    [
      {
        userId: 'carimbo',
        sales: [
          venda({ approvedDate: new Date('2024-01-03T09:00:00.000Z'), transaction: 'C1' }),
          venda({ approvedDate: new Date('2025-01-03T09:00:00.000Z'), transaction: 'C2' }),
          venda({ approvedDate: new Date('2026-08-07T09:00:00.000Z'), transaction: 'C3', offerCode: 'parcelas', paymentMode: 'MULTIPLE_PAYMENTS' }),
          venda({ approvedDate: new Date('2026-09-07T09:00:00.000Z'), transaction: 'C4', offerCode: 'parcelas', paymentMode: 'MULTIPLE_PAYMENTS' }),
          venda({ approvedDate: new Date('2026-10-07T09:00:00.000Z'), transaction: 'C5', offerCode: 'parcelas', paymentMode: 'MULTIPLE_PAYMENTS' })
        ]
      },
      {
        userId: 'normal',
        sales: [venda({ approvedDate: new Date('2024-03-01T00:00:00.000Z'), transaction: 'N1' })]
      },
      {
        userId: 'normal',
        sales: [venda({ approvedDate: new Date('2025-03-01T00:00:00.000Z'), transaction: 'N2' })]
      },
      {
        userId: 'alinhada',
        sales: [venda({ approvedDate: new Date('2026-06-10T08:00:00.000Z'), transaction: 'A1' })]
      },
      {
        userId: 'sem-334',
        sales: [venda({ approvedDate: new Date('2026-07-20T08:00:00.000Z'), transaction: 'S1' })]
      },
      {
        userId: 'sem-data',
        sales: [venda({ transaction: 'SEM-DATA' })]
      }
    ]
  )

  assert.deepEqual(linhas, [
    {
      email: 'zeta,"especial"@example.com',
      ac_334_data_compra: '2026-08-07T12:00:00.000Z',
      hotmart_ultima_cobranca: '2026-10-07T09:00:00.000Z',
      hotmart_primeira_cobranca_ultimo_ciclo: '2026-08-07T09:00:00.000Z',
      carimbo_2026_08_07: 'sim',
      ac_337_primeira_compra: '2025-01-03T09:00:00.000Z',
      hotmart_primeira_compra_real: '2024-01-03T09:00:00.000Z'
    },
    {
      email: 'ana@example.com',
      ac_334_data_compra: '2025-02-28T00:00:00.000Z',
      hotmart_ultima_cobranca: '2025-03-01T00:00:00.000Z',
      hotmart_primeira_cobranca_ultimo_ciclo: '2025-03-01T00:00:00.000Z',
      carimbo_2026_08_07: 'não',
      ac_337_primeira_compra: '',
      hotmart_primeira_compra_real: '2024-03-01T00:00:00.000Z'
    },
    {
      email: 'bruno@example.com',
      ac_334_data_compra: '',
      hotmart_ultima_cobranca: '2026-07-20T08:00:00.000Z',
      hotmart_primeira_cobranca_ultimo_ciclo: '2026-07-20T08:00:00.000Z',
      carimbo_2026_08_07: 'não',
      ac_337_primeira_compra: '',
      hotmart_primeira_compra_real: '2026-07-20T08:00:00.000Z'
    }
  ])
})

test('filtra o espelho acumulativo para apenas os userIds OGI activos', () => {
  const entradas = [
    { userId: 'activo', email: 'activo@example.com', purchaseDate: null, firstPurchaseDate: null },
    { userId: 'inactivo', email: 'inactivo@example.com', purchaseDate: null, firstPurchaseDate: null }
  ]

  assert.deepEqual(filtrarEntradasAcAtivas(entradas, ['activo']), [entradas[0]])
})

test('gera CSV com cabeçalho ordenado e escapa vírgulas e aspas', () => {
  const csv = gerarCsvRelatorioDataCompra([
    {
      email: 'zeta,"especial"@example.com',
      ac_334_data_compra: '2026-08-07T12:00:00.000Z',
      hotmart_ultima_cobranca: '2026-10-07T09:00:00.000Z',
      hotmart_primeira_cobranca_ultimo_ciclo: '2026-08-07T09:00:00.000Z',
      carimbo_2026_08_07: 'sim',
      ac_337_primeira_compra: '2025-01-03T09:00:00.000Z',
      hotmart_primeira_compra_real: '2024-01-03T09:00:00.000Z'
    }
  ])

  assert.equal(
    csv,
    'email,ac_334_data_compra,hotmart_ultima_cobranca,hotmart_primeira_cobranca_ultimo_ciclo,carimbo_2026_08_07,ac_337_primeira_compra,hotmart_primeira_compra_real\n"zeta,""especial""@example.com",2026-08-07T12:00:00.000Z,2026-10-07T09:00:00.000Z,2026-08-07T09:00:00.000Z,sim,2025-01-03T09:00:00.000Z,2024-01-03T09:00:00.000Z\n'
  )
})
