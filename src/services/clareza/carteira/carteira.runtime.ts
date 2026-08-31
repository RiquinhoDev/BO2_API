import axios from 'axios'
import { getRuntimeConfig } from '../../../config/runtimeConfig'
import type { IClarezaCarteiraItem } from '../../../models/ClarezaCarteiraData'
import { UNIVERSE } from './carteiraUniverse'
import { fmpThrottle } from '../fmpThrottle'
import { AxiosFmpCarteiraClient, type FmpCarteiraHttpPort } from './fmpCarteiraClient'
import { CarteiraMetricsFetcher, type Clock } from './carteiraMetrics'
import { RedisMongoCarteiraStore } from './carteiraStore'
import { ClarezaCarteiraService } from './carteira.service'

export const CLAREZA_CARTEIRA_CACHE_KEY = 'clareza:carteira-data'
export const CLAREZA_CARTEIRA_CACHE_TTL = 28800 // 8 hours
const REFRESH_CONCURRENCY = 12

const clock: Clock = { now: () => new Date() }
const http: FmpCarteiraHttpPort = {
  get: async (url, options) => axios.get<unknown>(url, options),
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

// Built lazily so importing this module never requires the config bootstrap;
// the canonical FMP key comes from typed config (getRuntimeConfig().fmp), never
// process.env, and stays fail-closed (undefined -> refresh throws).
let service: ClarezaCarteiraService | null = null
function getService(): ClarezaCarteiraService {
  if (service) return service
  const fmp = getRuntimeConfig().integrations.fmp
  const apiKey = fmp.configured ? fmp.value.apiKey : undefined

  service = new ClarezaCarteiraService(
    new CarteiraMetricsFetcher(new AxiosFmpCarteiraClient({
      apiKey,
      http,
      throttle: fmpThrottle,
      sleep,
    }), clock),
    new RedisMongoCarteiraStore(CLAREZA_CARTEIRA_CACHE_KEY),
    UNIVERSE,
    clock,
    { fmpConfigured: Boolean(apiKey), cacheTtl: CLAREZA_CARTEIRA_CACHE_TTL, concurrency: REFRESH_CONCURRENCY },
  )
  return service
}

export function refreshClarezaCarteiraData(): Promise<{ total: number; errors: number }> {
  return getService().refresh()
}

export function getClarezaCarteiraData(): Promise<IClarezaCarteiraItem[] | null> {
  return getService().getData()
}

export function searchCarteira(rawQuery: string) {
  return getService().search(rawQuery)
}
