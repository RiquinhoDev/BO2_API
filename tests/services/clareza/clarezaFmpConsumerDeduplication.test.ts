import axios from 'axios'

import type { AppConfig } from '../../../src/config/configTypes'
import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../../src/config/runtimeConfig'
import { fmpThrottle } from '../../../src/services/clareza/fmpThrottle'
import { fmpGet } from '../../../src/services/clareza/clarezaFmpAnalysisSupport'
import { fmpRaw } from '../../../src/services/clareza/raiox/data'

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    isAxiosError: jest.fn().mockReturnValue(false),
  },
}))

jest.mock('../../../src/services/clareza/fmpThrottle', () => ({
  fmpThrottle: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    get: jest.fn(),
    getRaw: jest.fn(),
    set: jest.fn(),
    setRaw: jest.fn(),
  },
}))

const mockedAxios = axios as jest.Mocked<typeof axios>
const mockedFmpThrottle = jest.mocked(fmpThrottle)

describe('Clareza FMP consumers', () => {
  afterEach(() => {
    resetRuntimeConfigForTests()
    jest.clearAllMocks()
  })

  it('deduplicates an equivalent profile request across analysis and Raio-X', async () => {
    initializeRuntimeConfig({
      integrations: {
        fmp: { configured: true, value: { apiKey: 'typed-key' } },
      },
    } as AppConfig)
    mockedAxios.get.mockResolvedValue({ data: [{ symbol: 'AAPL', price: 200 }] })

    const [analysis, raiox] = await Promise.all([
      fmpGet('/profile', { symbol: 'AAPL' }),
      fmpRaw('/profile', { symbol: 'AAPL' }),
    ])

    expect(analysis).toEqual({ symbol: 'AAPL', price: 200 })
    expect(raiox).toEqual([{ symbol: 'AAPL', price: 200 }])
    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
    expect(mockedFmpThrottle).toHaveBeenCalledTimes(1)
  })
})
