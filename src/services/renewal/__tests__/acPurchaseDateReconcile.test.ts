import assert from 'node:assert/strict'
import { test } from 'node:test'
import ACRenewalData from '../../../models/ACRenewalData'
import HotmartSaleHistory from '../../../models/HotmartSaleHistory'
import Product from '../../../models/product/Product'
import UserProduct from '../../../models/UserProduct'
import { activeCampaignService } from '../../activeCampaign/activeCampaignService'
import { AC_PURCHASE_DATE_FIELD_ID } from '../acRenewalDataSync.service'
import { reconcilePurchaseDates } from '../acPurchaseDateReconcile.service'
import type { VendaEntrada } from '../renewalTimeline.types'

const query = <T>(valor: T) => ({
  select: () => ({
    lean: () => ({
      exec: async () => valor
    })
  })
})

const venda = (partial: Partial<VendaEntrada> = {}): VendaEntrada => ({
  hotmartProductId: '1733154',
  productName: 'O Grande Investimento',
  transaction: 'TX-1',
  offerCode: 'oferta-ogi',
  transactionStatus: 'APPROVED',
  approvedDate: new Date('2026-05-20T09:00:00.000Z'),
  orderDate: null,
  priceValue: 397,
  currency: 'EUR',
  paymentMode: 'PAY_IN_FULL',
  ...partial
})

const alunoAc = (userId: string, partial: Record<string, unknown> = {}) => ({
  userId,
  email: `${userId}@example.com`,
  contactId: `contact-${userId}`,
  purchaseDate: new Date('2026-05-20T09:00:00.000Z'),
  ...partial
})

const alunoHotmart = (userId: string, sales: VendaEntrada[] = [venda()]) => ({ userId, sales })

function instalarFixtures(
  acEntries: any[],
  hotmartDocs: any[],
  opcoes: {
    activos?: string[]
    respostasAc?: Array<boolean | Error>
  } = {}
) {
  const productFindOneOriginal = (Product as any).findOne
  const userProductFindOriginal = (UserProduct as any).find
  const acFindOriginal = (ACRenewalData as any).find
  const hotmartFindOriginal = (HotmartSaleHistory as any).find
  const updateOriginal = activeCampaignService.updateContactField
  const activos = opcoes.activos ?? acEntries.map((entrada) => String(entrada.userId))
  const escritas: Array<[string, number, string]> = []
  const filtros = { produto: [] as any[], inscricoes: [] as any[], ac: [] as any[], hotmart: [] as any[] }

  ;(Product as any).findOne = (filtro: any) => {
    filtros.produto.push(filtro)
    return query({ _id: 'produto-ogi' })
  }
  ;(UserProduct as any).find = (filtro: any) => {
    filtros.inscricoes.push(filtro)
    return query(activos.map((userId) => ({ userId })))
  }
  ;(ACRenewalData as any).find = (filtro: any) => {
    filtros.ac.push(filtro)
    const ids = new Set((filtro.userId?.$in ?? []).map(String))
    return query(acEntries.filter((entrada) => ids.has(String(entrada.userId))))
  }
  ;(HotmartSaleHistory as any).find = (filtro: any) => {
    filtros.hotmart.push(filtro)
    const ids = new Set((filtro.userId?.$in ?? []).map(String))
    return query(hotmartDocs.filter((entrada) => ids.has(String(entrada.userId))))
  }
  activeCampaignService.updateContactField = async (email, fieldId, value) => {
    escritas.push([email, fieldId, value])
    const resposta = opcoes.respostasAc?.shift() ?? true
    if (resposta instanceof Error) throw resposta
    return resposta
  }

  return {
    escritas,
    filtros,
    restaurar: () => {
      ;(Product as any).findOne = productFindOneOriginal
      ;(UserProduct as any).find = userProductFindOriginal
      ;(ACRenewalData as any).find = acFindOriginal
      ;(HotmartSaleHistory as any).find = hotmartFindOriginal
      activeCampaignService.updateContactField = updateOriginal
    }
  }
}

test('334 igual à âncora fica contado como já certo e não escreve', async (t) => {
  const fixtures = instalarFixtures([alunoAc('igual')], [alunoHotmart('igual')])
  t.after(fixtures.restaurar)

  const report = await reconcilePurchaseDates({ dryRun: false })

  assert.deepEqual(report, {
    verificados: 1,
    escritos: 0,
    jaCertos: 1,
    semDados: 0,
    erros: 0,
    alteracoes: []
  })
  assert.deepEqual(fixtures.escritas, [])
})

test('334 com a data de hoje é reposto na âncora de há três meses', async (t) => {
  const fixtures = instalarFixtures(
    [alunoAc('carimbado', { purchaseDate: new Date('2026-08-20T09:00:00.000Z') })],
    [alunoHotmart('carimbado')]
  )
  t.after(fixtures.restaurar)

  const report = await reconcilePurchaseDates({ dryRun: false })

  assert.equal(report.escritos, 1)
  assert.deepEqual(report.alteracoes, [{
    email: 'carimbado@example.com',
    antes: '2026-08-20',
    depois: '2026-05-20'
  }])
  assert.deepEqual(fixtures.escritas, [['carimbado@example.com', AC_PURCHASE_DATE_FIELD_ID, '2026-05-20']])
})

test('sem venda, sem âncora ou sem contacto conta semDados e não escreve', async (t) => {
  const fixtures = instalarFixtures(
    [
      alunoAc('sem-venda'),
      alunoAc('sem-ancora'),
      alunoAc('sem-contacto', { contactId: null })
    ],
    [
      alunoHotmart('sem-ancora', [venda({ approvedDate: null, orderDate: null })]),
      alunoHotmart('sem-contacto')
    ]
  )
  t.after(fixtures.restaurar)

  const report = await reconcilePurchaseDates({ dryRun: false })

  assert.equal(report.verificados, 3)
  assert.equal(report.semDados, 3)
  assert.equal(report.escritos, 0)
  assert.deepEqual(fixtures.escritas, [])
})

test('prestações usam a primeira cobrança do último ciclo, nunca a última', async (t) => {
  const fixtures = instalarFixtures(
    [alunoAc('prestacoes', { purchaseDate: new Date('2026-08-20T00:00:00.000Z') })],
    [alunoHotmart('prestacoes', [
      venda({ transaction: 'P1', approvedDate: new Date('2026-05-20T09:00:00.000Z'), paymentMode: 'MULTIPLE_PAYMENTS' }),
      venda({ transaction: 'P2', approvedDate: new Date('2026-06-20T09:00:00.000Z'), paymentMode: 'MULTIPLE_PAYMENTS' }),
      venda({ transaction: 'P3', approvedDate: new Date('2026-07-20T09:00:00.000Z'), paymentMode: 'MULTIPLE_PAYMENTS' })
    ])]
  )
  t.after(fixtures.restaurar)

  await reconcilePurchaseDates({ dryRun: false })

  assert.deepEqual(fixtures.escritas, [['prestacoes@example.com', AC_PURCHASE_DATE_FIELD_ID, '2026-05-20']])
})

test('aluno inactivo é ignorado pelo filtro Product/UserProduct', async (t) => {
  const fixtures = instalarFixtures(
    [
      alunoAc('activo', { purchaseDate: null }),
      alunoAc('inactivo', { purchaseDate: null })
    ],
    [alunoHotmart('activo'), alunoHotmart('inactivo')],
    { activos: ['activo'] }
  )
  t.after(fixtures.restaurar)

  const report = await reconcilePurchaseDates({ dryRun: false })

  assert.equal(report.verificados, 1)
  assert.deepEqual(fixtures.escritas, [['activo@example.com', AC_PURCHASE_DATE_FIELD_ID, '2026-05-20']])
  assert.deepEqual(fixtures.filtros.produto, [{
    platform: 'hotmart',
    isActive: true,
    $or: [{ code: /^OGI/i }, { courseCode: /^OGI/i }, { name: /Grande Investimento/i }]
  }])
  assert.deepEqual(fixtures.filtros.inscricoes, [{
    platform: 'hotmart',
    productId: 'produto-ogi',
    status: 'ACTIVE'
  }])
})

test('dry-run por omissão relata a alteração sem chamar a AC', async (t) => {
  const fixtures = instalarFixtures(
    [alunoAc('dry-run', { purchaseDate: null })],
    [alunoHotmart('dry-run')]
  )
  t.after(fixtures.restaurar)

  const report = await reconcilePurchaseDates()

  assert.equal(report.escritos, 0)
  assert.deepEqual(report.alteracoes, [{ email: 'dry-run@example.com', antes: null, depois: '2026-05-20' }])
  assert.deepEqual(fixtures.escritas, [])
})

test('334 vazio escreve em modo real e diferença até 24 horas não escreve', async (t) => {
  const fixtures = instalarFixtures(
    [
      alunoAc('vazio', { purchaseDate: null }),
      alunoAc('limite', { purchaseDate: new Date('2026-05-21T09:00:00.000Z') })
    ],
    [alunoHotmart('vazio'), alunoHotmart('limite')]
  )
  t.after(fixtures.restaurar)

  const report = await reconcilePurchaseDates({ dryRun: false })

  assert.equal(report.escritos, 1)
  assert.equal(report.jaCertos, 1)
  assert.deepEqual(fixtures.escritas, [['vazio@example.com', AC_PURCHASE_DATE_FIELD_ID, '2026-05-20']])
})

test('false e throw da AC contam erro sem inventar sucesso', async (t) => {
  const fixtures = instalarFixtures(
    [
      alunoAc('false', { purchaseDate: null }),
      alunoAc('throw', { purchaseDate: null })
    ],
    [alunoHotmart('false'), alunoHotmart('throw')],
    { respostasAc: [false, new Error('AC indisponível')] }
  )
  t.after(fixtures.restaurar)

  const report = await reconcilePurchaseDates({ dryRun: false })

  assert.equal(report.verificados, 2)
  assert.equal(report.escritos, 0)
  assert.equal(report.erros, 2)
  assert.equal(report.alteracoes.length, 2)
})
