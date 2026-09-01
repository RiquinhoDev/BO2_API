import { CLAREZA_UNIVERSE } from '../universe/clarezaUniverse.catalog'
import { MongooseCoreGenerationStore } from './coreGenerationStore'
import { createCorePublishedRuntime } from './corePublishedRuntime'
import { createCoreRaioxRuntime } from './coreRaioxRuntime'
import { MongooseCoreRaioxCompanionStore } from './coreRaioxCompanionStore'
import { createCoreComparadorRuntime } from './coreComparadorRuntime'
import { createCoreEarningsRuntime } from './coreEarningsRuntime'
import { MongooseCoreEarningsCompanionStore } from './coreEarningsCompanionStore'

const runtime = createCorePublishedRuntime({
  store: new MongooseCoreGenerationStore(),
  universe: CLAREZA_UNIVERSE,
})

export const getPublishedRadar = runtime.radar
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
