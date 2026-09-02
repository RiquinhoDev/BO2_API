import { CLAREZA_UNIVERSE } from '../universe/clarezaUniverse.catalog'
import { clarezaFmpJsonClient } from '../fmpJsonRuntime'
import { FMP_STABLE_BASE_URL } from '../fmpJsonClient'
import { cacheService } from '../../cache.service'
import {
  analyzeCarteiraPortfolio,
  type CoreCarteiraAnalyzeCachePort,
  type CoreCarteiraAnalyzeEntry,
  type CoreCarteiraAnalyzeFmpPort,
} from './coreCarteiraAnalyze'

// 6 horas — o histórico de resultados não muda durante o dia (igual ao
// ANALYSE_TTL do clareza-carteira-data.php).
const ANALYSE_TTL_SECONDS = 6 * 60 * 60

const fmp: CoreCarteiraAnalyzeFmpPort = {
  async get(path, params) {
    const data = await clarezaFmpJsonClient.get({ baseUrl: FMP_STABLE_BASE_URL, path, params })
    const firstItem = Array.isArray(data) ? data[0] : data
    if (firstItem && typeof firstItem === 'object' && 'Error Message' in firstItem) return null
    return data
  },
}

const cache: CoreCarteiraAnalyzeCachePort = {
  get: key => cacheService.get<CoreCarteiraAnalyzeEntry>(key),
  set: (key, value, ttlSeconds) => cacheService.set(key, value, ttlSeconds),
}

export function analyzePublishedCarteira(
  rawSymbols: string,
): Promise<{ readonly results: Record<string, CoreCarteiraAnalyzeEntry> }> {
  return analyzeCarteiraPortfolio(rawSymbols, {
    fmp,
    cache,
    universe: CLAREZA_UNIVERSE,
    ttlSeconds: ANALYSE_TTL_SECONDS,
  })
}
