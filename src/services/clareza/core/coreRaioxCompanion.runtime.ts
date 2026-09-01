import { clarezaFmpJsonClient } from '../fmpJsonRuntime'
import { FMP_STABLE_BASE_URL } from '../fmpJsonClient'
import { CLAREZA_UNIVERSE } from '../universe/clarezaUniverse.catalog'
import { CoreRaioxCompanionCollector, type CoreRaioxCompanionFmpPort } from './coreRaioxCompanionCollector'
import { createCoreRaioxCompanionRefresh } from './coreRaioxCompanionRefresh'
import { MongooseCoreRaioxCompanionStore } from './coreRaioxCompanionStore'

const fmp: CoreRaioxCompanionFmpPort = {
  get: (path, params) => clarezaFmpJsonClient.getOrThrow({
    baseUrl: FMP_STABLE_BASE_URL,
    path,
    params,
  }),
}

const store = new MongooseCoreRaioxCompanionStore()
const collector = new CoreRaioxCompanionCollector(fmp, CLAREZA_UNIVERSE, {
  concurrency: 6,
  now: () => new Date(),
})

export const refreshCoreRaioxCompanion = createCoreRaioxCompanionRefresh({ collector, store })
