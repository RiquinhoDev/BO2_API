import assert from 'node:assert/strict'
import { test } from 'node:test'
import ACRenewalData from '../../../models/ACRenewalData'
import HotmartSaleHistory from '../../../models/HotmartSaleHistory'
import RenewalOffer from '../../../models/RenewalOffer'
import { activeCampaignService } from '../../activeCampaign/activeCampaignService'
import * as acExpirationSync from '../acExpirationSync.service'
import { TURMA_1_RENEWAL_OFFER_CODE, TURMA_2_RENEWAL_OFFER_CODE } from '../renewalConstants'
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

const query = <T>(entries: T[]) => ({
  select: () => ({
    lean: () => ({
      exec: async () => entries
    })
  })
})

const oferta = (partial: Record<string, unknown> = {}) => ({
  offerCode: 'oferta-renovacao',
  offerName: 'Renovação Turma 11 | 2509',
  periodYYMM: '2509',
  isRenewal: true,
  ...partial
})

function instalarFixturesSync(acEntries: any[], hotmartDocs: any[], ofertas = [oferta()]) {
  const acFindOriginal = (ACRenewalData as any).find
  const hotmartFindOriginal = (HotmartSaleHistory as any).find
  const renewalOfferFindOriginal = (RenewalOffer as any).find
  const updateOriginal = activeCampaignService.updateContactField
  const escritas: Array<[string, number, string]> = []

  ;(ACRenewalData as any).find = () => query(acEntries)
  ;(HotmartSaleHistory as any).find = () => query(hotmartDocs)
  ;(RenewalOffer as any).find = () => query(ofertas)
  activeCampaignService.updateContactField = async (email, fieldId, value) => {
    escritas.push([email, fieldId, value])
    return true
  }

  return {
    escritas,
    restaurar: () => {
      ;(ACRenewalData as any).find = acFindOriginal
      ;(HotmartSaleHistory as any).find = hotmartFindOriginal
      ;(RenewalOffer as any).find = renewalOfferFindOriginal
      activeCampaignService.updateContactField = updateOriginal
    }
  }
}

const alunoAc = (partial: Record<string, unknown> = {}) => ({
  userId: 'aluno-1',
  email: 'aluno@example.com',
  contactId: 'contact-1',
  purchaseDate: null,
  expirationDate: null,
  refundDate: null,
  purchaseStatus: null,
  ...partial
})

const alunoHotmart = (data: Date, partial: Record<string, unknown> = {}) => ({
  userId: 'aluno-1',
  sales: [venda({ approvedDate: data, transaction: 'TX-1', offerCode: 'oferta-renovacao' })],
  latestApprovedDate: data,
  latestTransactionStatus: 'APPROVED',
  ...partial
})

test('computeExpirationFromPurchaseDate respeita os anos e devolve o último instante do mês', () => {
  const casos = [
    ['2026-08-11T12:00:00Z', 1, '2027-08-31T23:59:59.999Z'],
    ['2026-01-31T12:00:00Z', 1, '2027-01-31T23:59:59.999Z'],
    ['2024-02-29T12:00:00Z', 1, '2025-02-28T23:59:59.999Z'],
    ['2026-12-15T12:00:00Z', 1, '2027-12-31T23:59:59.999Z'],
    ['2026-09-11T12:00:00Z', 2, '2028-09-30T23:59:59.999Z']
  ] as const

  for (const [compra, anos, esperado] of casos) {
    assert.equal(acExpirationSync.computeExpirationFromPurchaseDate(new Date(compra), anos).toISOString(), esperado)
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
  assert.equal(encurtaria(new Date('2027-05-31T23:59:59.999Z'), new Date('2026-05-31T23:59:59.999Z')), false)
  assert.equal(encurtaria(new Date('2026-05-31T23:59:59.999Z'), null), false)
})

test('syncAcExpirationDates conta encurtaria e diverge mesmo com o gatilho alinhado', async (t) => {
  const compra = new Date('2025-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ purchaseDate: compra, expirationDate: new Date('2027-05-31T23:59:59.999Z') })],
    [alunoHotmart(compra)]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates()

  assert.equal(report.skippedWouldShorten, 1)
  assert.equal(report.divergentes.length, 1)
  assert.equal(report.divergentes[0].motivo, 'encurtaria')
  assert.equal(fixtures.escritas.length, 0)
})

test('syncAcExpirationDates em dry-run por defeito só reporta a escrita que faria', async (t) => {
  const compraAntiga = new Date('2025-05-15T00:00:00Z')
  const compraNova = new Date('2026-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ purchaseDate: compraAntiga })],
    [alunoHotmart(compraNova)]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates()

  assert.equal(report.wouldWrite, 1)
  assert.equal(report.written, 0)
  assert.equal(fixtures.escritas.length, 0)
})

test('syncAcExpirationDates trata vendas apenas reembolsadas como reembolso Hotmart', async (t) => {
  const compra = new Date('2025-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc()],
    [
      alunoHotmart(compra, {
        sales: [venda({ approvedDate: compra, transactionStatus: 'REFUNDED' })],
        latestTransactionStatus: 'REFUNDED'
      })
    ]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates()

  assert.equal(report.skippedRefunded, 1)
  assert.equal(report.skippedNoHotmartData, 0)
  assert.equal(report.divergentes.length, 0)
  assert.equal(fixtures.escritas.length, 0)
})

test('syncAcExpirationDates reporta encurtaria quando há sales válidas mas falta latestApprovedDate', async (t) => {
  const compra = new Date('2025-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2027-05-31T23:59:59.999Z') })],
    [alunoHotmart(compra, { latestApprovedDate: null })]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates()

  assert.equal(report.skippedWouldShorten, 1)
  assert.equal(report.divergentes.length, 1)
  assert.equal(report.divergentes[0].motivo, 'encurtaria')
  assert.equal(fixtures.escritas.length, 0)
})

test('syncAcExpirationDates só conta falta de latestApprovedDate depois de avaliar divergência segura', async (t) => {
  const compra = new Date('2025-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2025-05-31T23:59:59.999Z') })],
    [alunoHotmart(compra, { latestApprovedDate: null })]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates()

  assert.equal(report.divergentes.length, 1)
  assert.equal(report.divergentes[0].motivo, 'diferente')
  assert.equal(report.skippedNoHotmartData, 1)
  assert.equal(fixtures.escritas.length, 0)
})

test('syncAcExpirationDates só escreve quando dryRun é explicitamente falso', async (t) => {
  const compraAntiga = new Date('2025-05-15T00:00:00Z')
  const compraNova = new Date('2026-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ purchaseDate: compraAntiga })],
    [alunoHotmart(compraNova)]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.wouldWrite, 0)
  assert.equal(report.written, 1)
  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2027-05-31']])
})

test('compra base preserva os dois anos do nome e escreve a expiração do período da oferta', async (t) => {
  const compra = new Date('2025-07-10T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc()],
    [alunoHotmart(compra, { sales: [venda({ approvedDate: compra, transaction: 'BASE', offerCode: 'oferta-base' })] })],
    [oferta({ offerCode: 'oferta-base', offerName: 'OGI Turma 14 + [2 anos] | L2509 | 397', periodYYMM: '2509', isRenewal: false })]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.semTurma, 0)
  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2027-09-30']])
})

test('códigos reais das Turmas 1 e 2 usam compra mais anos mesmo com nome base e isRenewal falso', async (t) => {
  const compraTurma1 = new Date('2026-01-05T00:00:00Z')
  const compraTurma2 = new Date('2025-06-05T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [
      alunoAc({ userId: 'turma-1', email: 'turma1@example.com' }),
      alunoAc({ userId: 'turma-2', email: 'turma2@example.com' })
    ],
    [
      alunoHotmart(compraTurma1, { userId: 'turma-1', sales: [venda({ approvedDate: compraTurma1, transaction: 'RENOV-T1', offerCode: TURMA_1_RENEWAL_OFFER_CODE })] }),
      alunoHotmart(compraTurma2, {
        userId: 'turma-2',
        sales: [
          venda({ approvedDate: compraTurma2, transaction: 'RENOV-T2', offerCode: TURMA_2_RENEWAL_OFFER_CODE }),
          venda({ approvedDate: compraTurma2, transaction: 'EXT-T2', offerCode: 'extensao', hotmartProductId: '3100292', priceValue: 97 })
        ]
      })
    ],
    [
      oferta({ offerCode: TURMA_1_RENEWAL_OFFER_CODE, offerName: 'OGI Turma 1 | L2701 | 397', periodYYMM: '2701', isRenewal: false }),
      oferta({ offerCode: TURMA_2_RENEWAL_OFFER_CODE, offerName: 'OGI Turma 2 | L2706 | 397', periodYYMM: '2706', isRenewal: false })
    ]
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.deepEqual(fixtures.escritas, [
    ['turma1@example.com', 332, '2027-01-31'],
    ['turma2@example.com', 332, '2027-06-30']
  ])
})

test('nome classificado como renovação escreve os dois anos do ciclo', async (t) => {
  const compra = new Date('2025-08-11T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2026-08-31T23:59:59.999Z') })],
    [alunoHotmart(compra, {
      sales: [
        venda({ approvedDate: compra, transaction: 'RENOV-2A', offerCode: 'renov-nome' }),
        venda({ approvedDate: compra, transaction: 'EXT-2A', offerCode: 'extensao', hotmartProductId: '3100292', priceValue: 97 })
      ]
    })],
    [oferta({ offerCode: 'renov-nome', offerName: 'Turma 11 [renov] | 2509', periodYYMM: '2509', isRenewal: false })]
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2027-08-31']])
})

test('ciclo de dois anos com a expiração vazia não cai no cálculo de um ano', async (t) => {
  const compra = new Date('2026-09-09T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: null })],
    [alunoHotmart(compra, {
      sales: [
        venda({ approvedDate: compra, transaction: 'RENOV-VAZIA', offerCode: 'renov-2a' }),
        venda({ approvedDate: compra, transaction: 'EXT-VAZIA', offerCode: 'extensao', hotmartProductId: '3100292', priceValue: 97 })
      ]
    })],
    [oferta({ offerCode: 'renov-2a', offerName: 'Renovação Turma 12 | 2609', periodYYMM: '2609', isRenewal: true })]
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2028-09-30']])
})

test('oferta base sem nome e período válidos não escreve e conta semTurma', async (t) => {
  const compra = new Date('2026-03-04T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc()],
    [alunoHotmart(compra, { sales: [venda({ approvedDate: compra, transaction: 'SEM-TURMA', offerCode: 'oferta-incompleta' })] })],
    [oferta({ offerCode: 'oferta-incompleta', offerName: 'OGI sem turma', periodYYMM: null, isRenewal: false })]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.semTurma, 1)
  assert.equal(report.needsWrite, 0)
  assert.equal(fixtures.escritas.length, 0)
})

test('encurtaria recusa escritas calculadas pelos ramos base e renovação', async (t) => {
  const compraBase = new Date('2025-07-10T00:00:00Z')
  const compraRenovacao = new Date('2026-01-05T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [
      alunoAc({ userId: 'base', email: 'base@example.com', expirationDate: new Date('2027-09-30T23:59:59.999Z') }),
      alunoAc({ userId: 'renovacao', email: 'renovacao@example.com', expirationDate: new Date('2028-01-31T23:59:59.999Z') })
    ],
    [
      alunoHotmart(compraBase, { userId: 'base', sales: [venda({ approvedDate: compraBase, transaction: 'BASE', offerCode: 'oferta-base' })] }),
      alunoHotmart(compraRenovacao, { userId: 'renovacao', sales: [venda({ approvedDate: compraRenovacao, transaction: 'RENOV', offerCode: 'oferta-renovacao' })] })
    ],
    [
      oferta({ offerCode: 'oferta-base', offerName: 'OGI Turma 15 | L2509 | 397', periodYYMM: '2509', isRenewal: false }),
      oferta()
    ]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.skippedWouldShorten, 2)
  assert.deepEqual(report.divergentes.map((d) => d.motivo), ['encurtaria', 'encurtaria'])
  assert.equal(fixtures.escritas.length, 0)
})

test('a compra âncora, não a última prestação, escolhe a oferta e a data', async (t) => {
  const ancora = new Date('2025-07-10T00:00:00Z')
  const prestacao = new Date('2025-08-10T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc()],
    [alunoHotmart(prestacao, {
      sales: [
        venda({ approvedDate: ancora, transaction: 'PLANO', offerCode: 'oferta-base' }),
        venda({ approvedDate: prestacao, transaction: 'PLANO', offerCode: 'oferta-renovacao' })
      ]
    })],
    [
      oferta({ offerCode: 'oferta-base', offerName: 'OGI Turma 15 | L2509 | 397', periodYYMM: '2509', isRenewal: false }),
      oferta()
    ]
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2026-09-30']])
})
