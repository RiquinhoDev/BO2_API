import axios from 'axios'
import mongoose from 'mongoose'

const mockRenewalOffer = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(),
}
const mockProductFindOne = jest.fn()
const mockUserFind = jest.fn()
const mockUserProductFind = jest.fn()
const mockGetHotmartAccessToken = jest.fn()

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))
jest.mock('../../../src/models/RenewalOffer', () => ({ __esModule: true, default: mockRenewalOffer }))
jest.mock('../../../src/models/product/Product', () => ({ __esModule: true, default: { findOne: mockProductFindOne } }))
jest.mock('../../../src/models/user', () => ({ __esModule: true, default: { find: mockUserFind } }))
jest.mock('../../../src/models/UserProduct', () => ({ __esModule: true, default: { find: mockUserProductFind } }))
jest.mock('../../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers', () => ({
  getHotmartAccessToken: mockGetHotmartAccessToken,
}))
jest.mock('../../../src/config/runtimeConfig', () => ({
  getRuntimeConfig: () => ({
    renewal: { hotmartOgiProductId: 'ogi-prod' },
  }),
}))

import { syncRenewalOffers } from '../../../src/services/renewal/renewalSync.service'
import { enrichOffers } from '../../../src/services/renewal/renewalSync.planning'

const runSync = syncRenewalOffers as unknown as (options?: {
  dryRun?: boolean
  phaseHooks?: ReturnType<typeof phaseHooks>
}) => Promise<unknown>

function query<T>(result: T) {
  const chain = {
    sort: jest.fn(),
    select: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  }
  chain.sort.mockReturnValue(chain)
  chain.select.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.lean.mockReturnValue(chain)
  return chain
}

function sale(code = 'O1', name = 'Renova OGI 2501') {
  return {
    purchase: {
      product: { id: 'ogi-prod' },
      offer: { code, name, payment_mode: 'ONE_TIME' },
      price: { value: 10, currency_code: 'EUR' },
    },
    buyer: { email: 'buyer@example.test' },
  }
}

function phaseHooks() {
  return {
    assertOwnership: jest.fn(),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(axios.get).mockReset()
  mockGetHotmartAccessToken.mockResolvedValue('token')
  mockProductFindOne.mockReturnValue(query({ _id: 'ogi-object', hotmartProductId: 'ogi-prod' }))
  mockUserFind.mockReturnValue(query([]))
  mockUserProductFind.mockReturnValue(query([]))
  mockRenewalOffer.find.mockReturnValue(query([]))
  mockRenewalOffer.findOne.mockReturnValue(query(null))
  mockRenewalOffer.create.mockResolvedValue({})
  mockRenewalOffer.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1 })
})

test('rejects a repeated provider cursor before fetching another page', async () => {
  jest.mocked(axios.get)
    .mockResolvedValueOnce({ data: { items: [sale()], page_info: { next_page_token: 'same' } } })
    .mockResolvedValueOnce({ data: { items: [], page_info: { next_page_token: 'same' } } })
    .mockRejectedValueOnce(new Error('stop-unbounded-loop'))

  await expect(runSync({ phaseHooks: phaseHooks() })).rejects.toMatchObject({
    code: 'RENEWAL_OFFER_PROVIDER_PAGINATION_INVALID',
  })
  expect(axios.get).toHaveBeenCalledTimes(2)
  expect(mockRenewalOffer.create).not.toHaveBeenCalled()
  expect(mockRenewalOffer.updateOne).not.toHaveBeenCalled()
})

test('never fetches page 201 when the provider continues after the page budget', async () => {
  let calls = 0
  jest.mocked(axios.get).mockImplementation(async () => {
    calls += 1
    if (calls > 200) throw new Error('stop-unbounded-loop')
    return {
    data: { items: [], page_info: { next_page_token: `next-${calls}` } },
    }
  })

  await expect(runSync({ phaseHooks: phaseHooks() })).rejects.toMatchObject({
    code: 'RENEWAL_OFFER_PROVIDER_PAGE_CAP_EXCEEDED',
  })
  expect(axios.get).toHaveBeenCalledTimes(200)
})

test('rejects the physical local sentinel before any mutation', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { items: [sale()], page_info: {} } })
  mockRenewalOffer.find.mockReturnValue(query(
    Array.from({ length: 20_001 }, (_, index) => ({
      _id: `offer-${index}`,
      offerCode: `O${index}`,
      offerName: '',
      isActive: true,
      source: 'hotmart_sync',
      isManuallyEdited: false,
      lastSeenAt: new Date(0),
      periodStart: new Date(0),
    })),
  ))

  await expect(runSync({ phaseHooks: phaseHooks() })).rejects.toMatchObject({
    code: 'RENEWAL_OFFER_LOCAL_SNAPSHOT_CAP_EXCEEDED',
  })
  expect(mockRenewalOffer.create).not.toHaveBeenCalled()
  expect(mockRenewalOffer.updateOne).not.toHaveBeenCalled()
})

test('dry-run returns bounded counts and performs no local writes or mutation hook', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { items: [sale()], page_info: {} } })
  const hooks = phaseHooks()

  await expect(runSync({ dryRun: true, phaseHooks: hooks })).resolves.toMatchObject({
    success: true,
    dryRun: true,
    plan: {
      operation: 'renewal-offer-sync',
      dryRun: true,
      create: 1,
      update: 0,
      reactivate: 0,
      deactivate: 0,
      unchanged: 0,
      totalOperations: 1,
      remaining: 0,
      truncated: false,
      anomaly: false,
    },
  })
  expect(mockRenewalOffer.create).not.toHaveBeenCalled()
  expect(mockRenewalOffer.updateOne).not.toHaveBeenCalled()
  expect(hooks.localMutationStarted).not.toHaveBeenCalled()
})

test('rejects a continuation advertised after the accepted-sales budget without fetching again', async () => {
  const items = Array.from({ length: 20_000 }, (_, index) => sale(`O${index}`, `Renova ${index}`))
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { items, page_info: { next_page_token: 'too-many' } } })

  await expect(runSync({ phaseHooks: phaseHooks() })).rejects.toMatchObject({
    code: 'RENEWAL_OFFER_PROVIDER_SALES_CAP_EXCEEDED',
  })
  expect(axios.get).toHaveBeenCalledTimes(1)
  expect(mockRenewalOffer.create).not.toHaveBeenCalled()
})

test('rejects partial provider envelopes before accepting any sale', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { items: [sale()], partial: true, page_info: {} } })

  await expect(runSync({ phaseHooks: phaseHooks() })).rejects.toMatchObject({
    code: 'RENEWAL_OFFER_PROVIDER_RESPONSE_INVALID',
  })
  expect(mockRenewalOffer.create).not.toHaveBeenCalled()
})

test('rejects conflicting names for one provider offer identity', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { items: [sale('O1', 'Renova A'), sale('O1', 'Renova B')], page_info: {} } })

  await expect(runSync({ phaseHooks: phaseHooks() })).rejects.toMatchObject({
    code: 'RENEWAL_OFFER_PROVIDER_IDENTITY_CONFLICT',
  })
  expect(mockRenewalOffer.create).not.toHaveBeenCalled()
})

test('rejects an optimistic local mutation conflict instead of settling success', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { items: [sale()], page_info: {} } })
  mockRenewalOffer.find.mockReturnValue(query([{
    _id: 'offer-id',
    offerCode: 'O1',
    offerName: 'Renova OGI 2501',
    isActive: true,
    source: 'hotmart_sync',
    isManuallyEdited: false,
    lastSeenAt: new Date(0),
  }]))
  mockRenewalOffer.updateOne.mockResolvedValueOnce({ acknowledged: true, matchedCount: 0, modifiedCount: 0 })
  const hooks = phaseHooks()

  await expect(runSync({ phaseHooks: hooks })).rejects.toMatchObject({
    code: 'RENEWAL_OFFER_MUTATION_CONFLICT',
  })
  expect(hooks.localMutationStarted).toHaveBeenCalledTimes(1)
})

test('rejects effective operations over the aggregate mutation cap before any write', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { items: [sale()], page_info: {} } })
  mockRenewalOffer.find.mockReturnValue(query(Array.from({ length: 20_000 }, (_, index) => ({
    _id: `offer-${index}`,
    offerCode: `OLD-${index}`,
    offerName: 'Renova OGI 2501',
    isActive: true,
    source: 'hotmart_sync',
    isManuallyEdited: false,
    lastSeenAt: new Date(0),
    periodStart: new Date(0),
  }))))

  await expect(runSync({ phaseHooks: phaseHooks() })).rejects.toMatchObject({
    code: 'RENEWAL_OFFER_PLAN_CAP_EXCEEDED',
  })
  expect(mockRenewalOffer.updateOne).not.toHaveBeenCalled()
})

test('does not suggest a turma when the OGI enrollment snapshot is empty', async () => {
  mockUserFind.mockReturnValue(query([{
    _id: 'buyer-id',
    email: 'buyer@example.test',
    hotmart: { enrolledClasses: [{ className: 'Turma 4 | 2601', isActive: true }] },
  }]))
  mockUserProductFind.mockReturnValue(query([]))

  const [offer] = await enrichOffers([{
    offerCode: 'O1',
    offerName: 'Renova OGI 2601',
    paymentModes: new Set(['ONE_TIME']),
    priceValue: 10,
    currency: 'EUR',
    eurPriceCounts: new Map(),
    salesCount: 1,
    buyerEmails: new Set(['buyer@example.test']),
  }], new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'))

  expect(offer.suggestedTurmas).toEqual([])
  expect(offer.suggestionSampleSize).toBe(0)
})

test('keeps turma suggestions ordered by observed frequency', async () => {
  mockUserFind.mockReturnValue(query([
    { _id: 'buyer-a', email: 'a@example.test', hotmart: { enrolledClasses: [{ className: 'Turma 2 | 2601', isActive: true }] } },
    { _id: 'buyer-b', email: 'b@example.test', hotmart: { enrolledClasses: [{ className: 'Turma 1 | 2601', isActive: true }] } },
    { _id: 'buyer-c', email: 'c@example.test', hotmart: { enrolledClasses: [{ className: 'Turma 2 | 2601', isActive: true }] } },
  ]))
  mockUserProductFind.mockReturnValue(query([{ userId: 'buyer-a' }, { userId: 'buyer-b' }, { userId: 'buyer-c' }]))

  const [offer] = await enrichOffers([{
    offerCode: 'O1',
    offerName: 'Renova OGI 2601',
    paymentModes: new Set(['ONE_TIME']),
    priceValue: 10,
    currency: 'EUR',
    eurPriceCounts: new Map(),
    salesCount: 3,
    buyerEmails: new Set(['a@example.test', 'b@example.test', 'c@example.test']),
  }], new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'))

  expect(offer.suggestedTurmas.map((item) => item.turmaNumber)).toEqual([2, 1])
})

test('asserts ownership before requesting the Hotmart access token', async () => {
  const hooks = phaseHooks()
  mockGetHotmartAccessToken.mockImplementationOnce(async () => {
    expect(hooks.assertOwnership).toHaveBeenCalledTimes(1)
    return 'token'
  })
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { items: [], page_info: {} } })

  await expect(runSync({ dryRun: true, phaseHooks: hooks })).resolves.toMatchObject({ success: true, dryRun: true })
})
