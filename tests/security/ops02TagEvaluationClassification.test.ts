const mockUserFindOne = jest.fn()
const mockUserFind = jest.fn()
const mockUserProductFind = jest.fn()
const mockUserProductUpdateOne = jest.fn()
const mockProductFind = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { findOne: mockUserFindOne, find: mockUserFind },
}))

jest.mock('../../src/models', () => ({
  UserProduct: {
    find: mockUserProductFind,
    updateOne: mockUserProductUpdateOne,
  },
}))

jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { find: mockProductFind },
}))

import mongoose from 'mongoose'
import { evaluateTags, evaluateTagsBatch } from '../../src/controllers/tagEvaluation.controller'
import { getOps02Decision, getOps02HardeningGaps } from '../../src/security/ops02Policy'

function chain<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) }
}

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
}

function setupLocalEvaluation() {
  const userId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')
  const productId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439012')
  const user = {
    _id: userId,
    email: 'student@example.test',
    name: 'Student',
  }
  const userProduct = {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439013'),
    userId,
    productId,
    status: 'ACTIVE',
    activeCampaignData: { tags: ['BO_OLD'] },
  }

  mockUserFindOne.mockReturnValue(chain(user))
  mockUserFind.mockReturnValue({
    limit: jest.fn().mockReturnValue(chain([user])),
  })
  mockUserProductFind.mockReturnValue(chain([userProduct]))
  mockProductFind.mockReturnValue(chain([{ _id: productId, name: 'OGI V1', code: 'OGI_V1' }]))

  return { userId, productId }
}

afterEach(() => {
  jest.clearAllMocks()
})

describe('OPS-02 ActiveCampaign tag evaluation classification', () => {
  test.each([
    ['POST', '/api/tags/evaluate', false],
    ['POST', '/api/tags/evaluate-batch', true],
  ])('%s %s is local-only after complete write-path review', (method, path, bulk) => {
    const decision = getOps02Decision(method, path)
    expect(decision).not.toBeNull()
    expect(decision?.provider).toBeUndefined()
    expect(decision).toEqual(expect.objectContaining({
      scope: 'internal',
      authorization: 'super-admin',
      bulk,
      status: 'reviewed',
    }))
    expect(decision?.idempotency).toEqual({ status: 'not-applicable', reason: 'internal-write' })
    expect(decision?.killSwitch).toEqual({ status: 'not-applicable', reason: 'no-provider-mutation' })
    expect(decision?.dryRun).toEqual({ status: 'not-applicable', reason: 'no-provider-mutation' })
  })

  test('batch evaluation records the finite local-user cap', () => {
    expect(getOps02Decision('POST', '/api/tags/evaluate-batch')?.cap).toEqual({
      status: 'verified',
      reason: 'tag-evaluation-max-users',
      limit: 100,
    })
  })

  test('does not leave either local-only route in the hardening backlog', () => {
    const gapKeys = getOps02HardeningGaps().map(({ method, path }) => `${method} ${path}`)
    expect(gapKeys).not.toEqual(expect.arrayContaining([
      'POST /api/tags/evaluate',
      'POST /api/tags/evaluate-batch',
    ]))
  })

  test('dry-run produces a plan without local writes or provider calls', async () => {
    setupLocalEvaluation()
    const providerCall = jest.fn()
    const previousFetch = global.fetch
    global.fetch = providerCall as typeof fetch
    const res = response()
    const next = jest.fn()

    try {
      await evaluateTags(
        { body: { email: 'student@example.test', dryRun: true, updateLocalDB: true } },
        res,
        next,
      )
    } finally {
      global.fetch = previousFetch
    }

    expect(mockUserProductUpdateOne).not.toHaveBeenCalled()
    expect(providerCall).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  test('non-dry-run writes only the local UserProduct projection and replays to the same state', async () => {
    setupLocalEvaluation()
    const localState = { tags: ['BO_OLD'] }
    mockUserProductUpdateOne.mockImplementation(async (_filter, update) => {
      localState.tags = update.$set['activeCampaignData.tags']
    })
    const providerCall = jest.fn()
    const previousFetch = global.fetch
    global.fetch = providerCall as typeof fetch

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await evaluateTags(
          { body: { email: 'student@example.test', dryRun: false, updateLocalDB: true } },
          response(),
          jest.fn(),
        )
      }
    } finally {
      global.fetch = previousFetch
    }

    expect(mockUserProductUpdateOne).toHaveBeenCalledTimes(2)
    expect(localState.tags).toEqual(
      mockUserProductUpdateOne.mock.calls[0][1].$set['activeCampaignData.tags'],
    )
    expect(providerCall).not.toHaveBeenCalled()
  })

  test('batch enforces the finite cap and reports processed accounting at the cap', async () => {
    setupLocalEvaluation()
    const accepted = response()
    const next = jest.fn()
    await evaluateTagsBatch(
      { body: { emails: ['student@example.test'], limit: 100, dryRun: true } },
      accepted,
      next,
    )

    expect(mockUserFind).toHaveBeenCalledTimes(1)
    expect(mockUserFind.mock.results[0].value.limit).toHaveBeenCalledWith(100)
    expect(next).not.toHaveBeenCalled()
    expect(accepted.status).toHaveBeenCalledWith(200)
    expect(accepted.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        summary: expect.objectContaining({
          totalUsers: 1,
          processed: 1,
          errors: 0,
        }),
      }),
    }))

    mockUserFind.mockClear()
    const rejected = response()
    await evaluateTagsBatch(
      { body: { emails: ['student@example.test'], limit: 101, dryRun: true } },
      rejected,
      next,
    )

    expect(mockUserFind).not.toHaveBeenCalled()
    expect(rejected.status).toHaveBeenCalledWith(400)
  })

  test('batch local-write mode still has zero ActiveCampaign calls', async () => {
    setupLocalEvaluation()
    const providerCall = jest.fn()
    const previousFetch = global.fetch
    global.fetch = providerCall as typeof fetch
    const res = response()

    try {
      await evaluateTagsBatch(
        {
          body: {
            emails: ['student@example.test'],
            limit: 100,
            dryRun: false,
            updateLocalDB: true,
          },
        },
        res,
        jest.fn(),
      )
    } finally {
      global.fetch = previousFetch
    }

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockUserProductUpdateOne).toHaveBeenCalledTimes(1)
    expect(providerCall).not.toHaveBeenCalled()
  })
})
