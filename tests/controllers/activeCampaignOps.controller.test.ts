const productFindMock = jest.fn()
const userProductFindMock = jest.fn()
const countDocumentsMock = jest.fn()
const logCreateMock = jest.fn()
const logFindMock = jest.fn()
const evaluateMock = jest.fn()
const loggerErrorMock = jest.fn()
const executionFindOneMock = jest.fn()
const executionFindOneAndUpdateMock = jest.fn()
let activeExecution: {
  operation: string
  requestId: string
  ownerId: string
  status: string
  leaseExpiresAt?: Date
  result?: unknown
} | undefined

jest.mock('../../src/models/user', () => ({ __esModule: true, default: { countDocuments: countDocumentsMock } }))
jest.mock('../../src/models/product/Product', () => ({ __esModule: true, default: { find: productFindMock } }))
jest.mock('../../src/models/UserProduct', () => ({ __esModule: true, default: { find: userProductFindMock } }))
jest.mock('../../src/models/cron/CronExecutionLog', () => ({
  __esModule: true,
  default: { create: logCreateMock, find: logFindMock },
}))
jest.mock('../../src/models/ActiveCampaignExecution', () => ({
  __esModule: true,
  default: {
    findOne: executionFindOneMock,
    findOneAndUpdate: executionFindOneAndUpdateMock,
  },
}))
jest.mock('../../src/services/activeCampaign/decisionEngine.service', () => ({
  __esModule: true,
  default: { evaluateUserProduct: evaluateMock },
}))
jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: { error: loggerErrorMock, info: jest.fn(), warn: jest.fn() },
}))

import request from 'supertest'
import { getCronLogs, getStats, loadActiveUserProductsBounded, testCron } from '../../src/controllers/acTags/activeCampaignOps.controller'
import {
  appForCentralError,
  expectCentralError,
  type CentralErrorRoute,
} from '../support/centralErrorContract'
import { resetRuntimeConfigForTests, useTestRuntimeConfig } from '../support/runtimeConfig'

const emptyInput = { body: {}, params: {}, query: {} }
const testCronRoute = (
  onNext?: () => void,
  input: typeof emptyInput = emptyInput,
): CentralErrorRoute => ({
  kind: 'handler',
  method: 'post',
  handler: async (req, res, next) => {
    await testCron(input, req, res, (error) => {
      onNext?.()
      next(error)
    })
  },
})

function productQuery(value: unknown, rejected = false) {
  const chain = {
    limit: jest.fn(),
    populate: jest.fn(),
  }
  chain.limit.mockReturnValue(chain)
  if (rejected) chain.populate.mockRejectedValue(value)
  else chain.populate.mockResolvedValue(value)
  return chain
}

function userProductQuery(value: unknown) {
  const chain = { limit: jest.fn() }
  chain.limit.mockResolvedValue(value)
  return chain
}

const cronLogsRoute: CentralErrorRoute = {
  kind: 'handler',
  handler: getCronLogs,
}

describe('ActiveCampaign operational boundary', () => {
  beforeEach(() => {
    useTestRuntimeConfig()
    jest.clearAllMocks()
    activeExecution = undefined
    executionFindOneMock.mockImplementation(() => {
      const chain = { select: jest.fn(), lean: jest.fn() }
      chain.select.mockReturnValue(chain)
      chain.lean.mockResolvedValue(activeExecution)
      return chain
    })
    executionFindOneAndUpdateMock.mockImplementation((filter: { operation: string; ownerId?: string; status?: string }, update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }) => {
      const set = update.$set ?? {}
      const requestId = typeof set.requestId === 'string' ? set.requestId : undefined
      if (requestId !== undefined) {
        const canClaim = !activeExecution
          || activeExecution.operation !== filter.operation
          || (activeExecution.status !== 'running' && activeExecution.requestId !== requestId)
          || (activeExecution.status === 'running'
            && activeExecution.leaseExpiresAt !== undefined
            && activeExecution.leaseExpiresAt <= new Date())
        if (!canClaim) return null
        activeExecution = {
          operation: filter.operation,
          requestId,
          ownerId: String(set.ownerId),
          status: String(set.status),
          leaseExpiresAt: set.leaseExpiresAt as Date,
        }
        return activeExecution
      }
      if (
        activeExecution
        && filter.ownerId === activeExecution.ownerId
        && filter.status === activeExecution.status
      ) {
        Object.assign(activeExecution, set)
        if (update.$unset?.leaseExpiresAt) delete activeExecution.leaseExpiresAt
        return activeExecution
      }
      return null
    })
  })
  afterEach(() => resetRuntimeConfigForTests())

  const enableActiveCampaign = () => {
    resetRuntimeConfigForTests()
    useTestRuntimeConfig({ activeCampaignProductTagsEnabled: true })
  }
  it.each([1, 10, 100])('bounds %i independent product reads and retains indexed results', async (size: number) => {
    let active = 0
    let peak = 0
    const releases: Array<() => void> = []
    const loader = jest.fn((productId: string) => new Promise<Array<{ productId: string }>>((resolve) => {
      active++
      peak = Math.max(peak, active)
      releases.push(() => { active--; resolve([{ productId }]) })
    }))
    const products = Array.from({ length: size }, (_, index) => ({ _id: `p-${index}` }))
    const pending = loadActiveUserProductsBounded(products, loader, 10)
    await Promise.resolve()
    expect(peak).toBe(Math.min(size, 10))
    while (releases.length > 0) {
      releases.splice(0).forEach(release => release())
      await Promise.resolve()
    }
    const results = await Promise.all(pending)
    expect(results.map(result => result.ok && result.userProducts[0].productId)).toEqual(
      products.map(product => product._id),
    )
  })

  it('exposes an earlier indexed read without waiting for a later hung read', async () => {
    let releaseFirst!: (value: Array<{ productId: string }>) => void
    const loader = jest.fn((productId: string) => productId === 'p-0'
      ? new Promise<Array<{ productId: string }>>(resolve => { releaseFirst = resolve })
      : new Promise<Array<{ productId: string }>>(() => undefined))
    const reads = loadActiveUserProductsBounded([{ _id: 'p-0' }, { _id: 'p-1' }], loader, 2)
    releaseFirst([{ productId: 'p-0' }])

    await expect((await reads)[0]).resolves.toEqual({
      ok: true,
      userProducts: [{ productId: 'p-0' }],
    })
  })

  it('keeps product read failures indexed without starting provider evaluation', async () => {
    const products = [{ _id: 'p-0' }, { _id: 'p-1' }, { _id: 'p-2' }]
    const loader = jest.fn(async (productId: string) => {
      if (productId === 'p-1') throw new Error('read failed')
      return [{ productId }]
    })
    await expect(Promise.all(loadActiveUserProductsBounded(products, loader, 2))).resolves.toEqual([
      { ok: true, userProducts: [{ productId: 'p-0' }] },
      { ok: false, error: expect.objectContaining({ message: 'read failed' }) },
      { ok: true, userProducts: [{ productId: 'p-2' }] },
    ])
    expect(evaluateMock).not.toHaveBeenCalled()
  })


  it('continues after a user failure and records the exact execution counters', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_000).mockReturnValueOnce(2_500)
    const product = { _id: { toString: () => 'product-1' }, name: 'Curso', code: 'CURSO' }
    enableActiveCampaign()
    productFindMock.mockReturnValue(productQuery([product]))
    userProductFindMock.mockReturnValue(userProductQuery([
      { _id: 'up-ok', userId: { toString: () => 'user-ok' } },
      { _id: 'up-fail', userId: { toString: () => 'user-fail' } },
      { _id: 'up-after', userId: { toString: () => 'user-after' } },
    ]))
    evaluateMock.mockResolvedValueOnce({ actionsExecuted: 2, errors: [] }).mockRejectedValueOnce(new Error('falhou')).mockResolvedValueOnce({ actionsExecuted: 3, errors: [] })
    logCreateMock.mockResolvedValue(undefined)
    const response = await request(appForCentralError(testCronRoute(undefined, {
      body: { dryRun: false }, params: {}, query: {},
    })))
      .post('/target?__bo2_offline_loopback=1')
      .set('X-Request-ID', 'manual-success')
      .send({})

    expect(evaluateMock).toHaveBeenNthCalledWith(1, 'user-ok', 'product-1', false)
    expect(evaluateMock).toHaveBeenNthCalledWith(2, 'user-fail', 'product-1', false)
    expect(evaluateMock).toHaveBeenNthCalledWith(3, 'user-after', 'product-1', false)
    expect(logCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      executionId: 'MANUAL_1000',
      status: 'success',
      duration: 1500,
      results: expect.objectContaining({
        totalProducts: 1,
        totalUserProducts: 3,
        decisionsEvaluated: 2,
        actionsExecuted: 5,
        errors: [expect.objectContaining({ userProductId: 'up-fail', error: 'falhou' })],
      }),
    }))
    expect(response.status).toBe(200)
    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        results: { totalProducts: 1, totalUserProducts: 3, decisionsEvaluated: 2, actionsExecuted: 5, errors: 1 },
      }),
    }))
    jest.restoreAllMocks()
  })

  it('rejects a manual run above the finite cap before provider evaluation', async () => {
    enableActiveCampaign()
    const product = { _id: { toString: () => 'product-1' }, name: 'Curso', code: 'CURSO' }
    productFindMock.mockReturnValue(productQuery([product]))
    userProductFindMock.mockReturnValue(userProductQuery(Array.from({ length: 201 }, (_value, index) => ({
      _id: `up-${index}`,
      userId: { toString: () => `user-${index}` },
    }))))
    evaluateMock.mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      return { actionsExecuted: 0, errors: [] }
    }).mockResolvedValue({ actionsExecuted: 0, errors: [] })
    logCreateMock.mockResolvedValue(undefined)

    const response = await request(appForCentralError(testCronRoute(undefined, {
      body: { dryRun: false }, params: {}, query: {},
    })))
      .post('/target?__bo2_offline_loopback=1')
      .send({})

    expect(response.status).toBe(413)
    expect(response.body.code).toBe('AC_ACTIVE_CAMPAIGN_LIMIT_EXCEEDED')
    expect(evaluateMock).not.toHaveBeenCalled()
  })

  it('rejects concurrent manual runs from entering the same provider evaluation', async () => {
    enableActiveCampaign()
    const product = { _id: { toString: () => 'product-1' }, name: 'Curso', code: 'CURSO' }
    productFindMock.mockReturnValue(productQuery([product]))
    userProductFindMock.mockReturnValue(userProductQuery([
      { _id: 'up-1', userId: { toString: () => 'user-1' } },
    ]))
    evaluateMock.mockResolvedValue({ actionsExecuted: 0, errors: [] })
    logCreateMock.mockResolvedValue(undefined)
    const app = appForCentralError(testCronRoute(undefined, {
      body: { dryRun: false }, params: {}, query: {},
    }))

    const responses = await Promise.all([
      request(app).post('/target?__bo2_offline_loopback=1').send({}),
      request(app).post('/target?__bo2_offline_loopback=1').send({}),
    ])

    expect(responses.map(response => response.status).sort()).toEqual([200, 409])
    expect(evaluateMock).toHaveBeenCalledTimes(1)

    const replay = await request(app).post('/target?__bo2_offline_loopback=1').send({})
    expect(replay.status).toBe(200)
    expect(evaluateMock).toHaveBeenCalledTimes(1)
  })

  it('defaults manual runs to dry-run without an execution log', async () => {
    const product = { _id: { toString: () => 'product-1' }, name: 'Curso', code: 'CURSO' }
    productFindMock.mockReturnValue(productQuery([product]))
    userProductFindMock.mockReturnValue(userProductQuery([
      { _id: 'up-1', userId: { toString: () => 'user-1' } },
    ]))
    evaluateMock.mockResolvedValue({ actionsExecuted: 3, errors: [] })

    const response = await request(appForCentralError(testCronRoute()))
      .post('/target?__bo2_offline_loopback=1')
      .send({})

    expect(response.status).toBe(200)
    expect(response.body.data.dryRun).toBe(true)
    expect(evaluateMock).toHaveBeenCalledWith('user-1', 'product-1', true)
    expect(logCreateMock).not.toHaveBeenCalled()
  })

  it('blocks a live manual run when the ActiveCampaign kill switch is off', async () => {
    const response = await request(appForCentralError(testCronRoute(undefined, {
      body: { dryRun: false }, params: {}, query: {},
    })))
      .post('/target?__bo2_offline_loopback=1')
      .send({})

    expect(response.status).toBe(503)
    expect(response.body.code).toBe('AC_ACTIVE_CAMPAIGN_EXECUTION_DISABLED')
    expect(productFindMock).not.toHaveBeenCalled()
    expect(evaluateMock).not.toHaveBeenCalled()
    expect(logCreateMock).not.toHaveBeenCalled()
  })

  it('returns canonical read stats without changing the count query', async () => {
    countDocumentsMock.mockResolvedValue(7)
    const statsRoute: CentralErrorRoute = { kind: 'handler', handler: getStats }
    const response = await request(appForCentralError(statsRoute))
      .get('/target?__bo2_offline_loopback=1')

    expect(countDocumentsMock).toHaveBeenCalledWith({
      $or: [
        { 'hotmart.hotmartUserId': { $exists: true, $ne: null } },
        { 'curseduca.curseducaUserId': { $exists: true, $ne: null } },
      ],
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: { totalMonitored: 7, tagsAppliedToday: 0, emailsSent: 0, openRate: 0.65 },
    })
  })
  it('keeps the last-20 execution-log ordering', async () => {
    const logs = [{ executionId: 'latest' }]
    const limit = jest.fn().mockResolvedValue(logs)
    const sort = jest.fn().mockReturnValue({ limit })
    logFindMock.mockReturnValue({ sort })
    const response = await request(appForCentralError(cronLogsRoute))
      .get('/target?__bo2_offline_loopback=1')
    expect(sort).toHaveBeenCalledWith({ startedAt: -1 })
    expect(limit).toHaveBeenCalledWith(20)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true, data: { logs } })
  })

  it('preserves the original central error when failed-run auditing also rejects', async () => {
    enableActiveCampaign()
    const originalError = new Error('secret original evaluation failure')
    const auditError = new Error('secondary audit failure')
    const onNext = jest.fn()
    productFindMock.mockReturnValue(productQuery(originalError, true))
    logCreateMock.mockRejectedValue(auditError)

    const response = await request(appForCentralError(testCronRoute(onNext, {
      body: { dryRun: false }, params: {}, query: {},
    })))
      .post('/target?__bo2_offline_loopback=1')
      .send({})

    expectCentralError(response, {
      code: 'AC_MANUAL_EVALUATION_FAILED',
      message: 'Erro na avaliação manual',
    })
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Falha ao registar auditoria da avaliação manual',
      expect.objectContaining({ executionId: expect.any(String), status: 'failed' }),
    )
    expect(JSON.stringify(loggerErrorMock.mock.calls)).not.toMatch(
      /original evaluation failure|secondary audit failure/,
    )
  })
})
