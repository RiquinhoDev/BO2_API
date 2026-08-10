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
import { getCronLogs, testCron } from '../../src/controllers/acTags/activeCampaignOps.controller'
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
    const response = await request(appForCentralError(testCronRoute()))
      .post('/target?__bo2_offline_loopback=1')
      .send({})

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
    expect(response.status).toBe(200)
    expect(response.body).toEqual(expect.objectContaining({
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
    const response = await request(appForCentralError(cronLogsRoute))
      .get('/target?__bo2_offline_loopback=1')
    expect(sort).toHaveBeenCalledWith({ startedAt: -1 })
    expect(limit).toHaveBeenCalledWith(20)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true, logs })
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
      '❌ Erro ao registar falha da avaliação manual:',
      auditError,
    )
  })
})
