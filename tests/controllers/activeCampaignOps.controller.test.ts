const productFindMock = jest.fn()
const userProductFindMock = jest.fn()
const countDocumentsMock = jest.fn()
const logCreateMock = jest.fn()
const logFindMock = jest.fn()
const evaluateMock = jest.fn()

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

import { getCronLogs, testCron } from '../../src/controllers/acTags/activeCampaignOps.controller'

type MockResponse = { status: jest.Mock; json: jest.Mock }
function response(): MockResponse {
  const res: MockResponse = { status: jest.fn(), json: jest.fn() }
  res.status.mockReturnValue(res)
  return res
}

describe('ActiveCampaign operational boundary', () => {
  beforeEach(() => jest.clearAllMocks())

  it('continues after a user failure and records the exact execution counters', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_000).mockReturnValueOnce(2_500)
    const product = { _id: { toString: () => 'product-1' }, name: 'Curso', code: 'CURSO' }
    productFindMock.mockReturnValue({ populate: jest.fn().mockResolvedValue([product]) })
    userProductFindMock.mockResolvedValue([
      { _id: 'up-ok', userId: { toString: () => 'user-ok' } },
      { _id: 'up-fail', userId: { toString: () => 'user-fail' } },
    ])
    evaluateMock.mockResolvedValueOnce({ actionsExecuted: 2, errors: [] }).mockRejectedValueOnce(new Error('falhou'))
    logCreateMock.mockResolvedValue(undefined)
    const res = response()

    await testCron({ body: {}, params: {}, query: {} }, {} as never, res as never, jest.fn())

    expect(evaluateMock).toHaveBeenNthCalledWith(1, 'user-ok', 'product-1')
    expect(evaluateMock).toHaveBeenNthCalledWith(2, 'user-fail', 'product-1')
    expect(logCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      executionId: 'MANUAL_1000',
      status: 'success',
      duration: 1500,
      results: expect.objectContaining({
        totalProducts: 1,
        totalUserProducts: 2,
        decisionsEvaluated: 1,
        actionsExecuted: 2,
        errors: [expect.objectContaining({ userProductId: 'up-fail', error: 'falhou' })],
      }),
    }))
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      results: { totalProducts: 1, totalUserProducts: 2, decisionsEvaluated: 1, actionsExecuted: 2, errors: 1 },
    }))
    jest.restoreAllMocks()
  })

  it('keeps the last-20 execution-log ordering', async () => {
    const logs = [{ executionId: 'latest' }]
    const limit = jest.fn().mockResolvedValue(logs)
    const sort = jest.fn().mockReturnValue({ limit })
    logFindMock.mockReturnValue({ sort })
    const res = response()
    await getCronLogs({} as never, res as never, jest.fn())
    expect(sort).toHaveBeenCalledWith({ startedAt: -1 })
    expect(limit).toHaveBeenCalledWith(20)
    expect(res.json).toHaveBeenCalledWith({ success: true, logs })
  })
})