import axios from 'axios'

import { getFmpApiKey } from '../requestDrivenRuntimeConfig'
import { fmpThrottle } from './fmpThrottle'
import { FmpJsonClient, type FmpJsonHttpPort } from './fmpJsonClient'

const http: FmpJsonHttpPort = {
  get: async (url, options) => axios.get<unknown>(url, options),
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
