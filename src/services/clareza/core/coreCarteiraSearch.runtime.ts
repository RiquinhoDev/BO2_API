import { CLAREZA_UNIVERSE } from '../universe/clarezaUniverse.catalog'
import { MongooseCoreAliasStore } from './coreAliasStore'
import { MongooseCoreGenerationStore } from './coreGenerationStore'
import { createCoreCarteiraSearchRuntime } from './coreCarteiraSearchRuntime'

export const searchPublishedCarteira = createCoreCarteiraSearchRuntime({
  generationStore: new MongooseCoreGenerationStore(),
  aliasStore: new MongooseCoreAliasStore(),
  universe: CLAREZA_UNIVERSE,
})
