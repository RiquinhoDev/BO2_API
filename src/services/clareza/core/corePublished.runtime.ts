import { CLAREZA_UNIVERSE } from '../universe/clarezaUniverse.catalog'
import { MongooseCoreGenerationStore } from './coreGenerationStore'
import { createCorePublishedRuntime } from './corePublishedRuntime'
import { createCoreRaioxRuntime } from './coreRaioxRuntime'
import { MongooseCoreRaioxCompanionStore } from './coreRaioxCompanionStore'
import { createCoreComparadorRuntime } from './coreComparadorRuntime'
import { createCoreEarningsRuntime } from './coreEarningsRuntime'
import { MongooseCoreEarningsCompanionStore } from './coreEarningsCompanionStore'
import { createCoreTop10Runtime } from './coreTop10Runtime'
import { MongooseCoreTop10CompanionStore } from './coreTop10CompanionStore'
import { CORE_TOP10_REVISION, CORE_TOP10_SELECTIONS } from './coreTop10Selection'
import { normalizeQueryKey, normalizeSymbolKey, withCoreCache } from './coreReadCache'

// Mesmos TTLs que já declarávamos em Cache-Control nestes endpoints
// (src/controllers/clarezaCore.controller.ts): o Redis nunca promete menos
// frescura do que o browser já aceitava.
const READ_TTL_SECONDS = 60 * 60
const SEARCH_TTL_SECONDS = 10 * 60

const runtime = createCorePublishedRuntime({
  store: new MongooseCoreGenerationStore(),
  universe: CLAREZA_UNIVERSE,
})

export const getPublishedRadar = withCoreCache('radar', READ_TTL_SECONDS, () => 'all', runtime.radar)
export const getPublishedLegacyMarketData = withCoreCache(
  'legacy-market-data', READ_TTL_SECONDS, () => 'all', runtime.legacyMarketData,
)
export const getPublishedCarteira = withCoreCache('carteira', READ_TTL_SECONDS, () => 'all', runtime.carteira)
export const getPublishedPortfolioAnalysis = runtime.portfolioAnalysis

const raioxRuntime = createCoreRaioxRuntime({
  generationStore: new MongooseCoreGenerationStore(),
  companionStore: new MongooseCoreRaioxCompanionStore(),
  universe: CLAREZA_UNIVERSE,
})

export const getPublishedRaiox = withCoreCache('raiox', READ_TTL_SECONDS, normalizeSymbolKey, raioxRuntime.asset)
export const searchPublishedRaiox = withCoreCache(
  'raiox-search', SEARCH_TTL_SECONDS, normalizeQueryKey, raioxRuntime.search,
)

const comparadorRuntime = createCoreComparadorRuntime({
  generationStore: new MongooseCoreGenerationStore(),
  companionStore: new MongooseCoreRaioxCompanionStore(),
  universe: CLAREZA_UNIVERSE,
})

export const getPublishedComparador = withCoreCache(
  'comparador', READ_TTL_SECONDS, normalizeSymbolKey, comparadorRuntime.compare,
)
export const searchPublishedComparador = withCoreCache(
  'comparador-search', SEARCH_TTL_SECONDS, normalizeQueryKey, comparadorRuntime.search,
)

const earningsRuntime = createCoreEarningsRuntime({
  generationStore: new MongooseCoreGenerationStore(),
  companionStore: new MongooseCoreEarningsCompanionStore(),
  universe: CLAREZA_UNIVERSE,
  now: () => new Date(),
})

export const getPublishedEarnings = withCoreCache('earnings', READ_TTL_SECONDS, () => 'all', earningsRuntime.read)

const top10Runtime = createCoreTop10Runtime({
  generationStore: new MongooseCoreGenerationStore(),
  companionStore: new MongooseCoreTop10CompanionStore(),
  universe: CLAREZA_UNIVERSE,
  selections: CORE_TOP10_SELECTIONS,
  revision: CORE_TOP10_REVISION,
})

export const getPublishedTop10 = withCoreCache('top10', READ_TTL_SECONDS, () => 'all', top10Runtime.read)
