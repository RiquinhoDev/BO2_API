import { MongooseCoreCollectionRunStore } from './coreCollectionRunStore'
import { MongooseCoreEarningsCompanionStore } from './coreEarningsCompanionStore'
import { MongooseCoreGenerationStore } from './coreGenerationStore'
import { MongooseCoreRaioxCompanionStore } from './coreRaioxCompanionStore'
import { MongooseCoreTop10CompanionStore } from './coreTop10CompanionStore'
import { createCoreRetention } from './coreRetention'

// O ponteiro de publicação protege sempre a geração publicada e a anterior, que
// é a que o rollback usa. Este limite é o que se guarda para além dessas duas,
// e fica em 1 porque o cluster Atlas está no limite de espaço: cada geração
// extra arrasta os seus companions do Raio-X, que são a maior fatia da base.
const CORE_CANDIDATE_RETENTION = 1

const raiox = new MongooseCoreRaioxCompanionStore()
const earnings = new MongooseCoreEarningsCompanionStore()
const top10 = new MongooseCoreTop10CompanionStore()
const collectionRuns = new MongooseCoreCollectionRunStore()

export const runCoreRetention = createCoreRetention({
  generations: new MongooseCoreGenerationStore(),
  companions: [
    { name: 'Raio-X', prune: ids => raiox.prune(ids) },
    { name: 'Earnings', prune: ids => earnings.prune(ids) },
    { name: 'Top 10', prune: ids => top10.prune(ids) },
    { name: 'Collection Runs', prune: ids => collectionRuns.prune(ids) },
  ],
  candidateLimit: CORE_CANDIDATE_RETENTION,
})
