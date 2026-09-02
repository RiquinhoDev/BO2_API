import { refreshCoreEarningsCompanion } from './coreEarningsCompanion.runtime'
import { MongooseCoreGenerationStore } from './coreGenerationStore'
import { refreshCoreRaioxCompanion } from './coreRaioxCompanion.runtime'
import { refreshCoreTop10Companion } from './coreTop10Companion.runtime'
import { createCoreCompanionBackfill } from './coreCompanionBackfill'

const generationStore = new MongooseCoreGenerationStore()

export const backfillPublishedCoreCompanions = createCoreCompanionBackfill({
  readPublished: () => generationStore.readPublished(),
  raiox: refreshCoreRaioxCompanion,
  earnings: refreshCoreEarningsCompanion,
  top10: refreshCoreTop10Companion,
})
