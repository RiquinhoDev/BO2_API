import { installReadOnlyTransport } from '../../src/security/readOnlyTransport'
import axios from 'axios'

const https = require('node:https') as typeof import('node:https')

test('blocks native outbound writes before opening a request; audited GET reaches the transport', async () => {
  const request = jest.spyOn(https, 'request').mockReturnValue({ end: jest.fn() } as never)
  const originalFetch = globalThis.fetch
  const fetch = jest.fn().mockResolvedValue({ status: 200 })
  globalThis.fetch = fetch
  const restore = installReadOnlyTransport()
  try {
    expect(() => https.request('https://digitalmanager.guru/api/v2/subscriptions', { method: 'POST' })).toThrow('READ_ONLY_EGRESS_BLOCKED')
    expect(() => https.get('https://unknown.example/read')).toThrow('READ_ONLY_EGRESS_BLOCKED')
    expect(request).not.toHaveBeenCalled()
    await expect(axios.create({ adapter: 'http', proxy: false }).post('https://digitalmanager.guru/api/v2/subscriptions', {})).rejects.toThrow('READ_ONLY_EGRESS_BLOCKED')
    expect(request).not.toHaveBeenCalled()
    https.get('https://digitalmanager.guru/api/v2/subscriptions')
    expect(request).toHaveBeenCalledTimes(1)
    await expect(globalThis.fetch('https://digitalmanager.guru/api/v2/subscriptions', { method: 'DELETE' })).rejects.toThrow('READ_ONLY_EGRESS_BLOCKED')
    expect(fetch).not.toHaveBeenCalled()
    await globalThis.fetch('https://digitalmanager.guru/api/v2/subscriptions')
    expect(fetch).toHaveBeenCalledWith(expect.any(Request), { redirect: 'error' })
  } finally {
    restore()
    globalThis.fetch = originalFetch
    request.mockRestore()
  }
})
