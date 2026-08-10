jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }))
jest.mock('../../../src/services/clareza/fmpThrottle', () => ({ fmpThrottle: jest.fn().mockResolvedValue(undefined) }))

import axios from 'axios'
import { fmpThrottle } from '../../../src/services/clareza/fmpThrottle'
import { AxiosFmpCarteiraClient } from '../../../src/services/clareza/carteira/fmpCarteiraClient'

const mockedGet = axios.get as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('AxiosFmpCarteiraClient', () => {
  it('throttles, sends the injected apikey, and returns the object', async () => {
    mockedGet.mockResolvedValue({ data: { price: 10 } })
    const client = new AxiosFmpCarteiraClient('KEY123')

    const result = await client.fetch<{ price: number }>('/profile', { symbol: 'AAPL' })

    expect(result).toEqual({ price: 10 })
    expect(fmpThrottle).toHaveBeenCalledTimes(1)
    const [url, cfg] = mockedGet.mock.calls[0]
    expect(url).toContain('/profile')
    expect(cfg.params).toMatchObject({ apikey: 'KEY123', symbol: 'AAPL' })
    expect(cfg.timeout).toBe(15000)
  })

  it('returns the first element for an array response', async () => {
    mockedGet.mockResolvedValue({ data: [{ price: 1 }, { price: 2 }] })
    expect(await new AxiosFmpCarteiraClient('K').fetch('/x')).toEqual({ price: 1 })
  })

  it('returns null for an empty array response', async () => {
    mockedGet.mockResolvedValue({ data: [] })
    expect(await new AxiosFmpCarteiraClient('K').fetch('/x')).toBeNull()
  })

  it('returns null on an FMP "Error Message" payload', async () => {
    mockedGet.mockResolvedValue({ data: { 'Error Message': 'invalid' } })
    expect(await new AxiosFmpCarteiraClient('K').fetch('/x')).toBeNull()
  })

  it('returns null when axios throws', async () => {
    mockedGet.mockRejectedValue(new Error('network down'))
    expect(await new AxiosFmpCarteiraClient('K').fetch('/x')).toBeNull()
  })
})
