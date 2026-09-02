import { CLAREZA_UNIVERSE } from '../universe/clarezaUniverse.catalog'
import { FMP_STABLE_BASE_URL } from '../fmpJsonClient'
import { clarezaFmpJsonClient } from '../fmpJsonRuntime'
import { MongooseCoreAliasStore } from './coreAliasStore'
import { createCoreAliasWorkflow } from './coreAliasWorkflow'

const workflow = createCoreAliasWorkflow({
  store: new MongooseCoreAliasStore(),
  universe: CLAREZA_UNIVERSE.map(asset => ({ ticker: asset.ticker, kind: asset.kind })),
  fmp: {
    get: (path, params) => clarezaFmpJsonClient.getOrThrow({
      baseUrl: FMP_STABLE_BASE_URL, path, params,
    }),
  },
  now: () => new Date().toISOString(),
})

export const runCoreAliasMaintenance = workflow
