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

const runtime = createCorePublishedRuntime({
  store: new MongooseCoreGenerationStore(),
  universe: CLAREZA_UNIVERSE,
})

export const getPublishedRadar = runtime.radar
export const getPublishedLegacyMarketData = runtime.legacyMarketData
export const getPublishedCarteira = runtime.carteira
export const getPublishedPortfolioAnalysis = runtime.portfolioAnalysis

const raioxRuntime = createCoreRaioxRuntime({
  generationStore: new MongooseCoreGenerationStore(),
  companionStore: new MongooseCoreRaioxCompanionStore(),
  universe: CLAREZA_UNIVERSE,
})

export const getPublishedRaiox = raioxRuntime.asset
export const searchPublishedRaiox = raioxRuntime.search

const comparadorRuntime = createCoreComparadorRuntime({
  generationStore: new MongooseCoreGenerationStore(),
  companionStore: new MongooseCoreRaioxCompanionStore(),
  universe: CLAREZA_UNIVERSE,
})

export const getPublishedComparador = comparadorRuntime.compare
export const searchPublishedComparador = comparadorRuntime.search

const earningsRuntime = createCoreEarningsRuntime({
  generationStore: new MongooseCoreGenerationStore(),
  companionStore: new MongooseCoreEarningsCompanionStore(),
  universe: CLAREZA_UNIVERSE,
  now: () => new Date(),
})

export const getPublishedEarnings = earningsRuntime.read

const top10Runtime = createCoreTop10Runtime({
  generationStore: new MongooseCoreGenerationStore(),
  companionStore: new MongooseCoreTop10CompanionStore(),
  universe: CLAREZA_UNIVERSE,
  selections: CORE_TOP10_SELECTIONS,
  revision: CORE_TOP10_REVISION,
})

export const getPublishedTop10 = top10Runtime.read
