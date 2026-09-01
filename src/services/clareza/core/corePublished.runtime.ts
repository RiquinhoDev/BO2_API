import { CLAREZA_UNIVERSE } from '../universe/clarezaUniverse.catalog'
import { MongooseCoreGenerationStore } from './coreGenerationStore'
import { createCorePublishedRuntime } from './corePublishedRuntime'

const runtime = createCorePublishedRuntime({
  store: new MongooseCoreGenerationStore(),
  universe: CLAREZA_UNIVERSE,
})

export const getPublishedRadar = runtime.radar
export const getPublishedCarteira = runtime.carteira
export const getPublishedPortfolioAnalysis = runtime.portfolioAnalysis
