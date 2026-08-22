import assert from 'node:assert/strict'
import { test } from 'node:test'
import ACRenewalData from '../../../models/ACRenewalData'
import HotmartSaleHistory from '../../../models/HotmartSaleHistory'
import { activeCampaignService } from '../../activeCampaign/activeCampaignService'
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

const query = <T>(entries: T[]) => ({
  select: () => ({
    lean: () => ({
      exec: async () => entries
    })
  })
})

function instalarFixturesSync(acEntries: any[], hotmartDocs: any[]) {
  const acFindOriginal = (ACRenewalData as any).find
  const hotmartFindOriginal = (HotmartSaleHistory as any).find
  const updateOriginal = activeCampaignService.updateContactField
  const escritas: Array<[string, number, string]> = []

  ;(ACRenewalData as any).find = () => query(acEntries)
  ;(HotmartSaleHistory as any).find = () => query(hotmartDocs)
  activeCampaignService.updateContactField = async (email, fieldId, value) => {
    escritas.push([email, fieldId, value])
    return true
  }

  return {
    escritas,
    restaurar: () => {
      ;(ACRenewalData as any).find = acFindOriginal
      ;(HotmartSaleHistory as any).find = hotmartFindOriginal
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
  sales: [venda({ approvedDate: data, transaction: 'TX-1' })],
  latestApprovedDate: data,
  latestTransactionStatus: 'APPROVED',
  ...partial
})

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
