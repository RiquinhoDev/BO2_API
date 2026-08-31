import axios from 'axios'

import type { AppConfig } from '../../src/config/configTypes'
import ClarezaEarningsData from '../../src/models/ClarezaEarningsData'
import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../src/config/runtimeConfig'
import { IntegrationUnavailableError } from '../../src/errors/integrationUnavailableError'
import { cacheService } from '../../src/services/cache.service'
import { fmpThrottle } from '../../src/services/clareza/fmpThrottle'
import {
  fetchEarningsForTicker,
  getClarezaEarningsData,
  refreshClarezaEarningsData,
} from '../../src/services/clareza/clarezaEarningsService'

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../../src/services/cache.service', () => ({
  cacheService: {
    get: jest.fn(),
    set: jest.fn(),
  },
}))
jest.mock('../../src/services/clareza/fmpThrottle', () => ({
  fmpThrottle: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../src/models/ClarezaEarningsData', () => ({
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
const mockedEarningsModel = jest.mocked(ClarezaEarningsData)

function configWithFmp(fmp: AppConfig['integrations']['fmp']): AppConfig {
  return { integrations: { fmp } } as AppConfig
}

describe('Clareza earnings FMP configuration boundary', () => {
  const ambientApiKey = process.env.FMP_API_KEY

  beforeEach(() => {
    resetRuntimeConfigForTests()
    delete process.env.FMP_API_KEY
    jest.clearAllMocks()
  })

  afterEach(() => {
    resetRuntimeConfigForTests()
    if (ambientApiKey === undefined) delete process.env.FMP_API_KEY
    else process.env.FMP_API_KEY = ambientApiKey
  })

  test('throws typed unavailable before Axios when FMP is unconfigured', async () => {
    initializeRuntimeConfig(configWithFmp({ configured: false }))

    const error = await refreshClarezaEarningsData().catch(cause => cause)

    expect(error).toBeInstanceOf(IntegrationUnavailableError)
    expect(error).toMatchObject({
      name: 'IntegrationUnavailableError',
      message: 'Integration unavailable',
      integration: 'fmp',
    })
    expect(mockedAxios.get).not.toHaveBeenCalled()
    expect(mockedFmpThrottle).not.toHaveBeenCalled()
    expect(mockedCache.get).not.toHaveBeenCalled()
    expect(mockedCache.set).not.toHaveBeenCalled()
    expect(mockedEarningsModel.create).not.toHaveBeenCalled()
    expect(mockedEarningsModel.find).not.toHaveBeenCalled()
    expect(mockedEarningsModel.findOne).not.toHaveBeenCalled()
    expect(mockedEarningsModel.deleteMany).not.toHaveBeenCalled()
  })

  test('returns a cached payload without requiring FMP configuration or other boundaries', async () => {
    const cachedPayload = {
      updated: '2026-08-04T12:00:00.000Z',
      window: { from: '2026-08-04', to: '2026-12-02' },
      count: 1,
      earnings: [{ t: 'AAPL', d: '2026-08-20', e: 1.23, c: 'USD' }],
    }
    initializeRuntimeConfig(configWithFmp({ configured: false }))
    mockedCache.get.mockResolvedValueOnce(cachedPayload)

    await expect(getClarezaEarningsData()).resolves.toEqual(cachedPayload)
    expect(mockedAxios.get).not.toHaveBeenCalled()
    expect(mockedFmpThrottle).not.toHaveBeenCalled()
    expect(mockedEarningsModel.findOne).not.toHaveBeenCalled()
    expect(mockedCache.set).not.toHaveBeenCalled()
  })

  test('uses the typed runtime API key instead of ambient environment state', async () => {
    process.env.FMP_API_KEY = 'ambient-wrong-key'
    initializeRuntimeConfig(configWithFmp({
      configured: true,
      value: { apiKey: 'typed-fmp-key' },
    }))
    mockedAxios.get.mockResolvedValueOnce({ data: [] })

    await expect(fetchEarningsForTicker('AAPL')).resolves.toBeNull()
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://financialmodelingprep.com/stable/earnings',
      expect.objectContaining({
        params: expect.objectContaining({ apikey: 'typed-fmp-key', symbol: 'AAPL' }),
      }),
    )
  })

  test('deduplicates equivalent concurrent earnings requests', async () => {
    initializeRuntimeConfig(configWithFmp({
      configured: true,
      value: { apiKey: 'typed-fmp-key' },
    }))
    mockedAxios.get.mockResolvedValue({ data: [] })

    await Promise.all([
      fetchEarningsForTicker('AAPL'),
      fetchEarningsForTicker('AAPL'),
    ])

    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
    expect(mockedFmpThrottle).toHaveBeenCalledTimes(1)
  })
})
