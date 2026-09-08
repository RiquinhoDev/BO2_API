import { clarezaFmpJsonClient } from '../fmpJsonRuntime'
import { FMP_STABLE_BASE_URL } from '../fmpJsonClient'
import { CoreTop10CompanionCollector } from './coreTop10CompanionCollector'
import { createCoreTop10CompanionRefresh } from './coreTop10CompanionRefresh'
import { MongooseCoreTop10CompanionStore } from './coreTop10CompanionStore'
import { CORE_TOP10_SELECTIONS } from './coreTop10Selection'

const store = new MongooseCoreTop10CompanionStore()
const collector = new CoreTop10CompanionCollector({
  get: (path, params) => clarezaFmpJsonClient.getOrThrow({ baseUrl: FMP_STABLE_BASE_URL, path, params }),
}, CORE_TOP10_SELECTIONS, { concurrency: 5, now: () => new Date() })

export const refreshCoreTop10Companion = createCoreTop10CompanionRefresh({ collector, store })
