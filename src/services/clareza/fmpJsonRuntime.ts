import axios from 'axios'

import { getCanonicalFmpApiKey as getFmpApiKey } from './canonicalSettings'
import { fmpThrottle } from './fmpThrottle'
import { FmpJsonClient, type FmpJsonHttpPort } from './fmpJsonClient'
import {
  beforeCanonicalProviderRequest,
  canonicalProviderSucceeded,
} from './core/canonicalExecutionContext'

const http: FmpJsonHttpPort = {
  get: async (url, options) => {
    beforeCanonicalProviderRequest()
    const response = await axios.get<unknown>(url, options)
    canonicalProviderSucceeded()
    return response
  },
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export const clarezaFmpJsonClient = new FmpJsonClient({
  getApiKey: getFmpApiKey,
  http,
  throttle: fmpThrottle,
  sleep,
})
