import axios from 'axios'
import { fmpThrottle } from '../fmpThrottle'

const FMP_BASE = 'https://financialmodelingprep.com/stable'

/**
 * Port for the FMP data calls the Carteira refresh needs. The API key is
 * injected (never read from process.env here); tests inject a fake client so no
 * test touches the network.
 */
export interface FmpCarteiraClient {
  fetch<T extends object>(path: string, params?: Record<string, string>): Promise<T | null>
}

function hasFmpError(data: object): boolean {
  return 'Error Message' in data
}

export class AxiosFmpCarteiraClient implements FmpCarteiraClient {
  constructor(private readonly apiKey: string | undefined) {}

  async fetch<T extends object>(path: string, params: Record<string, string> = {}): Promise<T | null> {
    try {
      await fmpThrottle()
      const { data } = await axios.get<T | T[]>(`${FMP_BASE}${path}`, {
        params: { apikey: this.apiKey, ...params },
        timeout: 15000,
      })
      if (!data || (!Array.isArray(data) && hasFmpError(data))) return null
      if (Array.isArray(data)) return data[0] ?? null
      return data
    } catch {
      return null
    }
  }
}
