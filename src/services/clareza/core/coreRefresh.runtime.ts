import { assertClarezaRefreshEnabled, getFmpApiKey } from '../../requestDrivenRuntimeConfig'
import { CLAREZA_UNIVERSE, CLAREZA_UNIVERSE_SOURCE } from '../universe/clarezaUniverse.catalog'
import { MongooseCoreCollectionRunStore } from './coreCollectionRunStore'
import { MongooseCoreGenerationStore } from './coreGenerationStore'
import { createCoreMasterFetcher } from './coreMaster.runtime'
import { CoreRefreshExecution, type CoreRefreshExecutionResult } from './coreRefreshExecution'

const CORE_LEASE_MS = 15 * 60 * 1_000
const CORE_BATCH_SIZE = 12

const generationStore = new MongooseCoreGenerationStore()
const execution = new CoreRefreshExecution({
  runStore: new MongooseCoreCollectionRunStore(),
  generationStore,
  fetcher: createCoreMasterFetcher(),
  universe: CLAREZA_UNIVERSE,
  policy: {
    requiredDatasets: ['data'],
    minimumDatasetCoverage: { data: 0.9 },
    minimumScoringCoverage: 0.35,
    maximumScoringFailures: 5,
    maximumAgeMs: 60 * 60 * 1_000,
  },
  batchSize: CORE_BATCH_SIZE,
  leaseMs: CORE_LEASE_MS,
})

function identity(startedAt: string): string {
  return startedAt.replace(/[^0-9]/g, '')
}

async function executeOwned(startedAt: string): Promise<CoreRefreshExecutionResult> {
  const current = await generationStore.readPublished()
  const suffix = identity(startedAt)
  return execution.execute({
    runId: `core-run-${suffix}`,
    generationId: `core-generation-${suffix}`,
    universeVersion: `sha256:${CLAREZA_UNIVERSE_SOURCE.sha256}`,
    ownerId: `core-owner-${suffix}`,
    now: new Date(startedAt),
    mode: 'publish',
    expectedCurrentGenerationId: current?.generationId ?? null,
  })
}

export async function executeCanonicalCoreRefresh(startedAt: string): Promise<CoreRefreshExecutionResult> {
  assertClarezaRefreshEnabled()
  getFmpApiKey()
  if (Number.isNaN(new Date(startedAt).getTime())) throw new RangeError('core refresh start is invalid')
  return executeOwned(startedAt)
}
