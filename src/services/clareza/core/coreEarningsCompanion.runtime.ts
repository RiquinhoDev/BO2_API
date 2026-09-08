import { clarezaFmpJsonClient } from '../fmpJsonRuntime'
import { FMP_STABLE_BASE_URL } from '../fmpJsonClient'
import { CLAREZA_UNIVERSE } from '../universe/clarezaUniverse.catalog'
import { CoreEarningsCompanionCollector } from './coreEarningsCompanionCollector'
import { createCoreEarningsCompanionRefresh } from './coreEarningsCompanionRefresh'
import { MongooseCoreEarningsCompanionStore } from './coreEarningsCompanionStore'

const store = new MongooseCoreEarningsCompanionStore()
const collector = new CoreEarningsCompanionCollector({
  get: (path, params) => clarezaFmpJsonClient.getOrThrow({
    baseUrl: FMP_STABLE_BASE_URL, path, params,
  }),
}, CLAREZA_UNIVERSE, { concurrency: 6, now: () => new Date() })

export const refreshCoreEarningsCompanion = createCoreEarningsCompanionRefresh({ collector, store })
