const productFindMock = jest.fn()
const userProductFindMock = jest.fn()
const countDocumentsMock = jest.fn()
const logCreateMock = jest.fn()
const logFindMock = jest.fn()
const evaluateMock = jest.fn()
const loggerErrorMock = jest.fn()

jest.mock('../../src/models/user', () => ({ __esModule: true, default: { countDocuments: countDocumentsMock } }))
jest.mock('../../src/models/product/Product', () => ({ __esModule: true, default: { find: productFindMock } }))
jest.mock('../../src/models/UserProduct', () => ({ __esModule: true, default: { find: userProductFindMock } }))
jest.mock('../../src/models/cron/CronExecutionLog', () => ({
  __esModule: true,
  default: { create: logCreateMock, find: logFindMock },
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

const emptyInput = { body: {}, params: {}, query: {} }
const testCronRoute = (onNext?: () => void): CentralErrorRoute => ({
  kind: 'handler',
  method: 'post',
  handler: async (req, res, next) => {
    await testCron(emptyInput, req, res, (error) => {
      onNext?.()
      next(error)
    })
  },
})

const cronLogsRoute: CentralErrorRoute = {
  kind: 'handler',
  handler: getCronLogs,
}

describe('ActiveCampaign operational boundary', () => {
  beforeEach(() => jest.clearAllMocks())
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
    productFindMock.mockReturnValue({ populate: jest.fn().mockResolvedValue([product]) })
    userProductFindMock.mockResolvedValue([
      { _id: 'up-ok', userId: { toString: () => 'user-ok' } },
      { _id: 'up-fail', userId: { toString: () => 'user-fail' } },
      { _id: 'up-after', userId: { toString: () => 'user-after' } },
    ])
    evaluateMock.mockResolvedValueOnce({ actionsExecuted: 2, errors: [] }).mockRejectedValueOnce(new Error('falhou')).mockResolvedValueOnce({ actionsExecuted: 3, errors: [] })
    logCreateMock.mockResolvedValue(undefined)
    const response = await request(appForCentralError(testCronRoute()))
      .post('/target?__bo2_offline_loopback=1')
      .send({})

    expect(evaluateMock).toHaveBeenNthCalledWith(1, 'user-ok', 'product-1')
    expect(evaluateMock).toHaveBeenNthCalledWith(2, 'user-fail', 'product-1')
    expect(evaluateMock).toHaveBeenNthCalledWith(3, 'user-after', 'product-1')
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
    const originalError = new Error('secret original evaluation failure')
    const auditError = new Error('secondary audit failure')
    const onNext = jest.fn()
    productFindMock.mockReturnValue({
      populate: jest.fn().mockRejectedValue(originalError),
    })
    logCreateMock.mockRejectedValue(auditError)

    const response = await request(appForCentralError(testCronRoute(onNext)))
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
