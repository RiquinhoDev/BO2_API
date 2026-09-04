import { CLAREZA_UNIVERSE } from '../universe/clarezaUniverse.catalog'
import { MongooseCoreAliasStore } from './coreAliasStore'
import { MongooseCoreGenerationStore } from './coreGenerationStore'
import { createCoreCarteiraSearchRuntime } from './coreCarteiraSearchRuntime'
import { normalizeQueryKey, withCoreCache } from './coreReadCache'

// Mesmo TTL que já declarávamos em Cache-Control para esta rota
// (src/controllers/clarezaCore.controller.ts).
const SEARCH_TTL_SECONDS = 10 * 60

export const searchPublishedCarteira = withCoreCache(
  'carteira-search',
  SEARCH_TTL_SECONDS,
  normalizeQueryKey,
  createCoreCarteiraSearchRuntime({
    generationStore: new MongooseCoreGenerationStore(),
    aliasStore: new MongooseCoreAliasStore(),
    universe: CLAREZA_UNIVERSE,
  }),
)
