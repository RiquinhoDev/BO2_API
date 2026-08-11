import request from 'supertest'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import { appForCentralError, expectCentralError } from '../support/centralErrorContract'

installTestRuntimeConfigHooks()

const mockUserCountDocuments = jest.fn()
const mockUserAggregate = jest.fn()
const mockUserFind = jest.fn()
jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    countDocuments: mockUserCountDocuments,
    aggregate: mockUserAggregate,
    find: mockUserFind,
    findOne: jest.fn(),
    updateOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { find: jest.fn(), updateMany: jest.fn(), findByIdAndUpdate: jest.fn() },
}))

const mockFetchSubscriptions = jest.fn()
jest.mock('../../src/services/guru/guruSync.service', () => ({
  fetchAllSubscriptionsComplete: mockFetchSubscriptions,
}))

const mockWebhookFind = jest.fn()
jest.mock('../../src/models/GuruWebhook', () => ({
  __esModule: true,
  default: { find: mockWebhookFind, countDocuments: jest.fn() },
}))

import { getChurnLive, getChurnMetrics, getMRRMetrics } from '../../src/controllers/guruAnalytics/churn.controller'
import { compareGuruVsClareza } from '../../src/controllers/guruAnalytics/comparison.controller'
import { fixMultiSubscriptions } from '../../src/controllers/guruAnalytics/subscriptionRepair.controller'
import { createListSubscriptions } from '../../src/controllers/guruSubscriptionList.controller'
import { listGuruWebhooks } from '../../src/controllers/guruWebhookList.controller'
import { createGuruExternalInactivationHandlers } from '../../src/controllers/guruInactivationExternal.controller'

const secret = new Error('secret alice@example.test token=hidden')
const offline = '?__bo2_offline_loopback=1'

const operations = [
  { name: 'live churn', handler: getChurnLive, arrange: () => mockFetchSubscriptions.mockRejectedValueOnce(secret), code: 'GURU_CHURN_LIVE_FAILED', message: 'Erro ao calcular churn live' },
  { name: 'churn', handler: getChurnMetrics, arrange: () => mockUserCountDocuments.mockImplementationOnce(() => { throw secret }), code: 'GURU_CHURN_READ_FAILED', message: 'Erro ao calcular churn' },
  { name: 'MRR', handler: getMRRMetrics, arrange: () => mockUserAggregate.mockImplementationOnce(() => { throw secret }), code: 'GURU_MRR_READ_FAILED', message: 'Erro ao calcular MRR' },
  { name: 'comparison', handler: compareGuruVsClareza, arrange: () => mockUserFind.mockImplementationOnce(() => { throw secret }), code: 'GURU_COMPARISON_READ_FAILED', message: 'Erro ao comparar Guru e Clareza' },
  { name: 'repair', handler: fixMultiSubscriptions, arrange: () => mockFetchSubscriptions.mockRejectedValueOnce(secret), code: 'GURU_SUBSCRIPTION_REPAIR_FAILED', message: 'Erro ao analisar subscrições múltiplas' },
  { name: 'subscription list', handler: createListSubscriptions({ model: { find: () => { throw secret }, countDocuments: jest.fn() } }), arrange: () => undefined, code: 'GURU_SUBSCRIPTION_LIST_FAILED', message: 'Erro ao listar subscrições' },
  { name: 'webhook list', handler: listGuruWebhooks, arrange: () => mockWebhookFind.mockImplementationOnce(() => { throw secret }), code: 'GURU_WEBHOOK_LIST_FAILED', message: 'Erro ao listar webhooks' },
]

describe('SEC-10 Guru closure application boundary', () => {
  beforeEach(() => { jest.resetAllMocks(); jest.spyOn(console, 'log').mockImplementation(() => undefined); jest.spyOn(console, 'error').mockImplementation(() => undefined) })
  afterEach(() => { jest.restoreAllMocks() })

  it('covers seven fatal catches plus one remote fatal result', () => { expect(operations).toHaveLength(7) })

  it.each(operations)('$name uses the redacted central envelope', async (operation) => {
    operation.arrange()
    const response = await request(appForCentralError({ kind: 'handler', handler: operation.handler })).get(`/target${offline}`)
    expectCentralError(response, { code: operation.code, message: operation.message })
  })

  it('routes a typed remote inactivation failure without exposing its detail', async () => {
    const handlers = createGuruExternalInactivationHandlers({
      inactivateSingle: jest.fn().mockResolvedValue({ kind: 'remote-failure', error: 'secret token=hidden' }),
      inactivateBulk: jest.fn(),
    })
    const next = jest.fn()
    await Reflect.apply(handlers.inactivateSingle, undefined, [
      { params: {}, query: {}, body: { userProductId: 'user-product' } },
      { json: jest.fn(), status: jest.fn() },
      next,
    ])
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'GURU_INACTIVATION_SINGLE_REMOTE_FAILED' }))
  })
})
