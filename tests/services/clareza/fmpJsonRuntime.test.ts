import axios from 'axios'

import type { AppConfig } from '../../../src/config/configTypes'
import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../../src/config/runtimeConfig'
import { fmpThrottle } from '../../../src/services/clareza/fmpThrottle'
import {
  clarezaFmpJsonClient,
} from '../../../src/services/clareza/fmpJsonRuntime'
import { FMP_STABLE_BASE_URL } from '../../../src/services/clareza/fmpJsonClient'

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../../../src/services/clareza/fmpThrottle', () => ({
  fmpThrottle: jest.fn().mockResolvedValue(undefined),
}))

const mockedAxios = axios as jest.Mocked<typeof axios>
const mockedFmpThrottle = jest.mocked(fmpThrottle)

describe('shared Clareza FMP JSON runtime', () => {
  afterEach(() => {
    resetRuntimeConfigForTests()
    jest.clearAllMocks()
  })

  it('deduplicates an equivalent request shared by different consumers', async () => {
    initializeRuntimeConfig({
      integrations: {
        fmp: { configured: true, value: { apiKey: 'typed-key' } },
      },
    } as AppConfig)
    mockedAxios.get.mockResolvedValue({ data: [{ symbol: 'AAPL' }] })

    const request = {
      baseUrl: FMP_STABLE_BASE_URL,
      path: '/profile',
      params: { symbol: 'AAPL' },
    }
    const [first, second] = await Promise.all([
      clarezaFmpJsonClient.get(request),
      clarezaFmpJsonClient.get(request),
    ])

    expect(first).toEqual([{ symbol: 'AAPL' }])
    expect(second).toEqual([{ symbol: 'AAPL' }])
    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
    expect(mockedFmpThrottle).toHaveBeenCalledTimes(1)
  })
})
