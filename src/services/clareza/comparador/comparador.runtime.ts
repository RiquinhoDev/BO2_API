import axios from 'axios'
import ClarezaComparadorData from '../../../models/ClarezaComparadorData'
import { getFmpApiKey } from '../../requestDrivenRuntimeConfig'
import { cacheService } from '../../cache.service'
import { UNIVERSE } from '../clarezaFmpUniverse'
import { fmpThrottle } from '../fmpThrottle'
import {
  AxiosComparadorFmpClient,
  type ComparadorFmpHttpPort,
} from './comparadorFmpClient'
import { MongooseComparadorSnapshotRepository, RedisMongoComparadorStore } from './comparadorStore'
import { createComparadorService } from './comparador.service'

const COMPARADOR_CACHE_KEY = 'clareza:comparador:v1'
const COMPARADOR_CACHE_TTL_SECONDS = 90000
const COMPARADOR_CONCURRENCY = 8

const http: ComparadorFmpHttpPort = {
  get: async (url, options) => axios.get<unknown>(url, options),
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const store = new RedisMongoComparadorStore({
  cache: {
    get: (key) => cacheService.get<unknown>(key),
    set: (key, value, ttlSeconds) => cacheService.set(key, value, ttlSeconds),
  },
  repository: new MongooseComparadorSnapshotRepository(ClarezaComparadorData),
  cacheKey: COMPARADOR_CACHE_KEY,
  ttlSeconds: COMPARADOR_CACHE_TTL_SECONDS,
})

const fmp = new AxiosComparadorFmpClient({
  http,
  getApiKey: getFmpApiKey,
  throttle: fmpThrottle,
  sleep,
  now: () => new Date().toISOString(),
})

const service = createComparadorService({
  store,
  fmp,
  universe: UNIVERSE.map((entry) => entry.ticker),
  concurrency: COMPARADOR_CONCURRENCY,
  now: () => new Date().toISOString(),
  assertFmpAvailable: getFmpApiKey,
})

export const getComparadorSymbols = service.getComparadorSymbols
export const searchComparador = service.searchComparador
export const refreshComparadorSymbols = service.refreshComparadorSymbols
export const refreshClarezaComparadorData = service.refreshClarezaComparadorData
