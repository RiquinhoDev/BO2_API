import axios from 'axios'

import type { AppConfig } from '../../src/config/configTypes'
import ClarezaTop10Data from '../../src/models/ClarezaTop10Data'
import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../src/config/runtimeConfig'
import { IntegrationUnavailableError } from '../../src/errors/integrationUnavailableError'
import { cacheService } from '../../src/services/cache.service'
import { fmpThrottle } from '../../src/services/clareza/fmpThrottle'
import {
  getClarezaTop10Data,
  getClarezaTop10Json,
  refreshClarezaTop10Data,
} from '../../src/services/clareza/clarezaTop10Service'

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../../src/services/cache.service', () => ({
  cacheService: {
    get: jest.fn(),
    getRaw: jest.fn(),
    set: jest.fn(),
    setRaw: jest.fn(),
  },
}))

jest.mock('../../src/services/clareza/fmpThrottle', () => ({
  fmpThrottle: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../src/models/ClarezaTop10Data', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    deleteMany: jest.fn(),
  },
}))

const mockedAxios = axios as jest.Mocked<typeof axios>
const mockedCache = jest.mocked(cacheService)
const mockedFmpThrottle = jest.mocked(fmpThrottle)
const mockedTop10Model = jest.mocked(ClarezaTop10Data)

function configWithFmp(fmp: AppConfig['integrations']['fmp']): AppConfig {
  return { integrations: { fmp } } as AppConfig
}

describe('Clareza Top10 FMP configuration boundary', () => {
  const ambientApiKey = process.env.FMP_API_KEY
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    resetRuntimeConfigForTests()
    jest.restoreAllMocks()
    jest.clearAllMocks()
    if (ambientApiKey === undefined) delete process.env.FMP_API_KEY
    else process.env.FMP_API_KEY = ambientApiKey
  })

  test('unconfigured refresh fails typed before HTTP, throttle, or cache writes', async () => {
    initializeRuntimeConfig(configWithFmp({ configured: false }))

    const error = await refreshClarezaTop10Data().catch(cause => cause)

    expect(error).toBeInstanceOf(IntegrationUnavailableError)
    expect(error).toMatchObject({
      name: 'IntegrationUnavailableError',
      message: 'Integration unavailable',
      integration: 'fmp',
    })
    expect(mockedAxios.get).not.toHaveBeenCalled()
    expect(mockedFmpThrottle).not.toHaveBeenCalled()
    expect(mockedCache.set).not.toHaveBeenCalled()
    expect(mockedCache.setRaw).not.toHaveBeenCalled()
    expect(mockedTop10Model.create).not.toHaveBeenCalled()
    expect(mockedTop10Model.find).not.toHaveBeenCalled()
    expect(mockedTop10Model.findOne).not.toHaveBeenCalled()
    expect(mockedTop10Model.deleteMany).not.toHaveBeenCalled()
  })

  test('raw JSON cache remains available without FMP configuration', async () => {
    const rawJson = '{"stocks":{"AAPL":{"price":200}}}'
    initializeRuntimeConfig(configWithFmp({ configured: false }))
    mockedCache.getRaw.mockResolvedValueOnce(rawJson)

    await expect(getClarezaTop10Json()).resolves.toBe(rawJson)
    expect(mockedCache.getRaw).toHaveBeenCalledTimes(1)
    expect(mockedCache.get).not.toHaveBeenCalled()
    expect(mockedTop10Model.findOne).not.toHaveBeenCalled()
    expect(mockedAxios.get).not.toHaveBeenCalled()
    expect(mockedFmpThrottle).not.toHaveBeenCalled()
    expect(mockedCache.setRaw).not.toHaveBeenCalled()
  })

  test('object cache remains available without FMP configuration', async () => {
    const payload = {
      updated: '2026-08-04 12:00:00',
      source: 'Financial Modeling Prep',
      revision: 'Q2 2026',
      stocks: { AAPL: { price: 200 } },
    }
    initializeRuntimeConfig(configWithFmp({ configured: false }))
    mockedCache.get.mockResolvedValueOnce(payload)

    await expect(getClarezaTop10Data()).resolves.toEqual(payload)
    expect(mockedTop10Model.findOne).not.toHaveBeenCalled()
    expect(mockedAxios.get).not.toHaveBeenCalled()
    expect(mockedFmpThrottle).not.toHaveBeenCalled()
    expect(mockedCache.set).not.toHaveBeenCalled()
    expect(mockedCache.setRaw).not.toHaveBeenCalled()
  })

  test('Mongo snapshot fallback remains available without FMP configuration', async () => {
    const payload = {
      updated: '2026-08-04 12:00:00',
      source: 'Financial Modeling Prep',
      revision: 'Q2 2026',
      stocks: { AAPL: { price: 200 } },
    }
    initializeRuntimeConfig(configWithFmp({ configured: false }))
    mockedCache.get.mockResolvedValueOnce(null)
    mockedTop10Model.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          fetchedAt: new Date('2026-08-04T12:00:00.000Z'),
          payload,
        }),
      }),
    } as any)

    await expect(getClarezaTop10Data()).resolves.toEqual(payload)
    expect(mockedCache.set).toHaveBeenCalledTimes(1)
    expect(mockedAxios.get).not.toHaveBeenCalled()
    expect(mockedFmpThrottle).not.toHaveBeenCalled()
    expect(mockedTop10Model.create).not.toHaveBeenCalled()
    expect(mockedTop10Model.find).not.toHaveBeenCalled()
    expect(mockedTop10Model.deleteMany).not.toHaveBeenCalled()
  })

  test('configured refresh uses only the typed runtime key', async () => {
    process.env.FMP_API_KEY = 'ambient-wrong-key'
    initializeRuntimeConfig(configWithFmp({
      configured: true,
      value: { apiKey: 'typed-fmp-key' },
    }))
    mockedAxios.get.mockResolvedValue({ data: [] })
    mockedTop10Model.create.mockResolvedValue({} as any)
    mockedTop10Model.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    } as any)

    const result = await refreshClarezaTop10Data()

    expect(result).toEqual({ total: 10, errors: 0 })
    expect(mockedAxios.get.mock.calls.length).toBeGreaterThan(0)
    for (const call of mockedAxios.get.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({
          params: expect.objectContaining({ apikey: 'typed-fmp-key' }),
        }),
      )
    }
    expect(mockedCache.set).toHaveBeenCalledTimes(1)
    expect(mockedCache.setRaw).toHaveBeenCalledTimes(1)
  })
})
