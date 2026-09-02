import { CLAREZA_UNIVERSE } from '../universe/clarezaUniverse.catalog'
import { createCoreSuggestionService } from './coreSuggestionService'
import { MongooseCoreSuggestionStore } from './coreSuggestionStore'
import { MongooseCoreAliasStore } from './coreAliasStore'

const store = new MongooseCoreSuggestionStore()
const aliasStore = new MongooseCoreAliasStore()
const service = createCoreSuggestionService({
  store,
  knownTickers: CLAREZA_UNIVERSE.map(asset => asset.ticker),
  resolveAlias: async ticker => {
    const snapshot = await aliasStore.read()
    for (const alias of snapshot.state.aliases) {
      if (alias.aliasTicker.trim().toUpperCase() === ticker) {
        return alias.canonicalTicker.trim().toUpperCase()
      }
    }
    return null
  },
  now: () => new Date().toISOString(),
})

export const submitCoreSuggestion = service.submit
