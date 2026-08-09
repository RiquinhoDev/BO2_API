import axios, { AxiosError, AxiosHeaders } from 'axios'
import type { ActiveCampaignIntegration } from '../../../src/config/configTypes'
import { IntegrationUnavailableError } from '../../../src/errors/integrationUnavailableError'
import { ActiveCampaignTransport } from '../../../src/services/activeCampaign/activeCampaignTransport'

const integration = (apiUrl: string): ActiveCampaignIntegration => ({
  apiUrl,
  apiKey: 'test-key',
  webhookSecret: 'test-secret',
  debugEnabled: false,
  verifyDeleteEnabled: false,
  lists: {},
})

describe('ActiveCampaignTransport', () => {
  afterEach(() => jest.restoreAllMocks())

  it('caches the client until runtime integration values change', () => {
    let current = integration('https://first.example.test/')
    const create = jest.spyOn(axios, 'create')
    const transport = new ActiveCampaignTransport({ readIntegration: () => current })

    const first = transport.client
    expect(transport.client).toBe(first)

    current = integration('https://second.example.test/')
    expect(transport.client).not.toBe(first)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('retries timeout failures using the configured delay', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined)
    const operation = jest.fn()
      .mockRejectedValueOnce(new AxiosError('timeout', 'ECONNABORTED'))
      .mockResolvedValue('ok')
    const transport = new ActiveCampaignTransport({
      readIntegration: () => integration('https://ac.example.test/'),
      sleep,
    })

    await expect(transport.retryRequest(operation)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(2_000)
  })

  it('retries server failures', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined)
    const serverFailure = new AxiosError(
      'unavailable',
      undefined,
      undefined,
      undefined,
      { status: 503, statusText: 'Unavailable', headers: {}, config: { headers: new AxiosHeaders() }, data: {} },
    )
    const operation = jest.fn()
      .mockRejectedValueOnce(serverFailure)
      .mockResolvedValue('ok')
    const transport = new ActiveCampaignTransport({
      readIntegration: () => integration('https://ac.example.test/'),
      sleep,
    })

    await expect(transport.retryRequest(operation)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })
  it('does not retry non-Axios failures', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined)
    const operation = jest.fn().mockRejectedValue(new Error('invalid'))
    const transport = new ActiveCampaignTransport({
      readIntegration: () => integration('https://ac.example.test/'),
      sleep,
    })

    await expect(transport.retryRequest(operation)).rejects.toThrow('invalid')
    expect(operation).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('fails before Axios when the integration is unavailable', () => {
    const create = jest.spyOn(axios, 'create')
    const transport = new ActiveCampaignTransport({
      readIntegration: () => { throw new IntegrationUnavailableError('activeCampaign') },
    })

    expect(() => transport.client).toThrow(IntegrationUnavailableError)
    expect(create).not.toHaveBeenCalled()
  })
})
