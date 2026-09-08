import assert from 'node:assert/strict'
import HotmartSaleHistory from '../../../../src/models/HotmartSaleHistory'
import Product from '../../../../src/models/product/Product'
import RenewalOffer from '../../../../src/models/RenewalOffer'
import UserProduct from '../../../../src/models/UserProduct'
import { getUnmappedBaseOffers } from '../../../../src/services/renewal/unmappedBaseOffers.service'
import { TURMA_1_RENEWAL_OFFER_CODE } from '../../../../src/services/renewal/renewalConstants'

const restores: Array<() => void> = []
afterEach(() => {
  while (restores.length > 0) restores.pop()?.()
})

const query = <T>(entries: T[]) => {
  const chain = {
    select: () => chain,
    sort: () => chain,
    maxTimeMS: () => chain,
    lean: () => chain,
    exec: async () => entries,
    cursor: () => (async function * () { yield * entries })(),
  }
  return chain
}

const queryOne = <T>(entry: T) => ({
  select: () => ({
    lean: () => ({
      exec: async () => entry
    })
  })
})

const offer = (partial: Record<string, unknown> = {}) => ({
  offerCode: 'base-sem-turma',
  offerName: 'OGI sem turma',
  periodYYMM: null,
  isRenewal: false,
  priceValue: 397,
  currency: 'EUR',
  lastSeenAt: new Date('2026-08-20T10:00:00.000Z'),
  ...partial
})

const sale = (offerCode: string, partial: Record<string, unknown> = {}) => ({
  offerCode,
  transactionStatus: 'APPROVED',
  approvedDate: new Date('2026-08-20T10:00:00.000Z'),
  orderDate: null,
  ...partial,
})

function installFixtures({
  offers,
  activeUsers,
  histories,
  historyBatchSizes,
}: {
  offers: Array<Record<string, unknown>>
  activeUsers: Array<{ userId: string }>
  histories: Array<{ userId: string; sales: Array<{ offerCode: string; transactionStatus: string }> }>
  historyBatchSizes?: number[]
}) {
  const renewalOfferFind = (RenewalOffer as any).find
  const productFindOne = (Product as any).findOne
  const userProductFind = (UserProduct as any).find
  const historyFind = (HotmartSaleHistory as any).find

  ;(RenewalOffer as any).find = () => query(offers)
  ;(Product as any).findOne = () => queryOne({ _id: 'ogi-product' })
  ;(UserProduct as any).find = () => query(activeUsers)
  ;(HotmartSaleHistory as any).find = (filter: { userId?: { $in?: unknown[] } } = {}) => {
    if (filter.userId?.$in) historyBatchSizes?.push(filter.userId.$in.length)
    return query(histories.filter((history) => !filter.userId?.$in || filter.userId.$in.some((userId) => String(userId) === history.userId)))
  }

  return () => {
    ;(RenewalOffer as any).find = renewalOfferFind
    ;(Product as any).findOne = productFindOne
    ;(UserProduct as any).find = userProductFind
    ;(HotmartSaleHistory as any).find = historyFind
  }
}

test('lista oferta base sem turma com dois alunos e três cobranças', async () => {
  const restore = installFixtures({
    offers: [offer()],
    activeUsers: [{ userId: 'a1' }, { userId: 'a2' }],
    histories: [
      { userId: 'a1', sales: [sale('base-sem-turma'), sale('base-sem-turma')] },
      { userId: 'a2', sales: [sale('base-sem-turma')] },
    ],
  })
  restores.push(restore)

  assert.deepEqual(await getUnmappedBaseOffers(), [{
    offerCode: 'base-sem-turma',
    offerName: 'OGI sem turma',
    periodYYMM: null,
    alunosAfetados: 2,
    salesCount: 3,
    priceValue: 397,
    currency: 'EUR',
    lastSeenAt: new Date('2026-08-20T10:00:00.000Z'),
  }])
})

test('exclui oferta de renovação sem turma', async () => {
  const restore = installFixtures({
    offers: [offer({ offerCode: 'renov', offerName: 'Renovação turma 3', isRenewal: true })],
    activeUsers: [{ userId: 'a1' }],
    histories: [{ userId: 'a1', sales: [sale('renov')] }],
  })
  restores.push(restore)

  assert.deepEqual(await getUnmappedBaseOffers(), [])
})

test('exclui oferta base já mapeada com turma e período válidos', async () => {
  const restore = installFixtures({
    offers: [offer({ offerName: 'OGI Turma 15 | L2605 | 397', periodYYMM: '2605' })],
    activeUsers: [{ userId: 'a1' }],
    histories: [{ userId: 'a1', sales: [sale('base-sem-turma')] }],
  })
  restores.push(restore)

  assert.deepEqual(await getUnmappedBaseOffers(), [])
})

test('exclui vendas de aluno sem matrícula OGI Hotmart ACTIVE', async () => {
  const restore = installFixtures({
    offers: [offer()],
    activeUsers: [{ userId: 'ativo' }],
    histories: [
      { userId: 'ativo', sales: [sale('base-sem-turma')] },
      { userId: 'inativo', sales: [sale('base-sem-turma'), sale('base-sem-turma')] },
    ],
  })
  restores.push(restore)

  assert.deepEqual(
    (await getUnmappedBaseOffers()).map((entry) => [entry.alunosAfetados, entry.salesCount]),
    [[1, 1]],
  )
})

test('conta só vendas válidas do escritor e ignora reembolsos, chargebacks e datas inválidas', async () => {
  const restore = installFixtures({
    offers: [offer()],
    activeUsers: [{ userId: 'sem-acesso' }, { userId: 'com-acesso' }],
    histories: [
      {
        userId: 'sem-acesso',
        sales: [
          sale('base-sem-turma', { transactionStatus: 'REFUNDED' }),
          sale('base-sem-turma', { transactionStatus: 'CHARGEBACK' }),
          sale('base-sem-turma', { transactionStatus: 'APPROVED', approvedDate: null, orderDate: null }),
        ],
      },
      { userId: 'com-acesso', sales: [sale('base-sem-turma', { transactionStatus: 'COMPLETE' })] },
    ],
  })
  restores.push(restore)

  assert.deepEqual(
    (await getUnmappedBaseOffers()).map((entry) => [entry.alunosAfetados, entry.salesCount]),
    [[1, 1]],
  )
})

test('ordena por alunos afectados descendente e depois por código', async () => {
  const restore = installFixtures({
    offers: [
      offer({ offerCode: 'zeta' }),
      offer({ offerCode: 'alfa' }),
      offer({ offerCode: 'beta' }),
      offer({ offerCode: TURMA_1_RENEWAL_OFFER_CODE }),
    ],
    activeUsers: [{ userId: 'a1' }, { userId: 'a2' }, { userId: 'a3' }],
    histories: [
      { userId: 'a1', sales: [sale('zeta'), sale('alfa'), sale('beta')] },
      { userId: 'a2', sales: [sale('zeta'), sale('alfa')] },
      { userId: 'a3', sales: [sale('zeta'), sale(TURMA_1_RENEWAL_OFFER_CODE)] },
    ],
  })
  restores.push(restore)

  assert.deepEqual(
    (await getUnmappedBaseOffers()).map((entry) => [entry.offerCode, entry.alunosAfetados]),
    [['zeta', 3], ['alfa', 2], ['beta', 1]],
  )
})

test('lê históricos em lotes de no máximo 200 sem truncar alunos activos', async () => {
  const historyBatchSizes: number[] = []
  const activeUsers = Array.from({ length: 250 }, (_, i) => ({ userId: `a${i}` }))
  const restore = installFixtures({
    offers: [offer()],
    activeUsers,
    histories: activeUsers.map(({ userId }) => ({ userId, sales: [sale('base-sem-turma')] })),
    historyBatchSizes,
  })
  restores.push(restore)

  assert.deepEqual(historyBatchSizes, [])
  const [result] = await getUnmappedBaseOffers()
  assert.equal(result?.alunosAfetados, 250)
  assert.deepEqual(historyBatchSizes, [200, 50])
})
