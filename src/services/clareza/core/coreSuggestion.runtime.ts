import { CLAREZA_UNIVERSE } from '../universe/clarezaUniverse.catalog'
import { createCoreSuggestionService } from './coreSuggestionService'
import { MongooseCoreSuggestionStore } from './coreSuggestionStore'

const store = new MongooseCoreSuggestionStore()
const service = createCoreSuggestionService({
  store,
  knownTickers: CLAREZA_UNIVERSE.map(asset => asset.ticker),
  now: () => new Date().toISOString(),
})

export const submitCoreSuggestion = service.submit
