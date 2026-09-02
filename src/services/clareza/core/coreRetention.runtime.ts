import { MongooseCoreEarningsCompanionStore } from './coreEarningsCompanionStore'
import { MongooseCoreGenerationStore } from './coreGenerationStore'
import { MongooseCoreRaioxCompanionStore } from './coreRaioxCompanionStore'
import { MongooseCoreTop10CompanionStore } from './coreTop10CompanionStore'
import { createCoreRetention } from './coreRetention'

const CORE_CANDIDATE_RETENTION = 3

const raiox = new MongooseCoreRaioxCompanionStore()
const earnings = new MongooseCoreEarningsCompanionStore()
const top10 = new MongooseCoreTop10CompanionStore()

export const runCoreRetention = createCoreRetention({
  generations: new MongooseCoreGenerationStore(),
  companions: [
    { name: 'Raio-X', prune: ids => raiox.prune(ids) },
    { name: 'Earnings', prune: ids => earnings.prune(ids) },
    { name: 'Top 10', prune: ids => top10.prune(ids) },
  ],
  candidateLimit: CORE_CANDIDATE_RETENTION,
})
