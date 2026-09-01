import { createCoreSuggestionAdminService } from './coreSuggestionAdmin'
import { MongooseCoreSuggestionStore } from './coreSuggestionStore'

const service = createCoreSuggestionAdminService({
  // HTTP routes enforce SUPER_ADMIN before this runtime boundary.
  authorize: () => undefined,
  store: new MongooseCoreSuggestionStore(),
})

export const listCoreSuggestions = service.list
export const exportCoreSuggestionsCsv = service.exportCsv
