import { randomUUID } from 'node:crypto'

import { cacheService } from '../../cache.service'
import { assertClarezaRefreshEnabled, getFmpApiKey } from '../../requestDrivenRuntimeConfig'
import { RefreshJobCoordinator, type RefreshJobExecutionContext } from '../operations/refreshJobCoordinator'
import { RedisRefreshJobStore } from '../operations/redisRefreshJobStore'
import { CLAREZA_UNIVERSE, CLAREZA_UNIVERSE_SOURCE } from '../universe/clarezaUniverse.catalog'
import { MongooseCoreCollectionRunStore } from './coreCollectionRunStore'
import { MongooseCoreGenerationStore } from './coreGenerationStore'
import { createCoreMasterFetcher } from './coreMaster.runtime'
import { CoreRefreshExecution, type CoreRefreshExecutionResult } from './coreRefreshExecution'

const CORE_JOB_KEY = 'clareza:jobs:canonical-daily-refresh'
const CORE_LEASE_MS = 15 * 60 * 1_000
const CORE_HEARTBEAT_MS = 60 * 1_000
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

async function executeOwned(context: RefreshJobExecutionContext): Promise<CoreRefreshExecutionResult> {
  const current = await generationStore.readPublished()
  const suffix = identity(context.startedAt)
  return execution.execute({
    runId: `core-run-${suffix}`,
    generationId: `core-generation-${suffix}`,
    universeVersion: `sha256:${CLAREZA_UNIVERSE_SOURCE.sha256}`,
    ownerId: `core-owner-${suffix}`,
    now: new Date(context.startedAt),
    mode: 'publish',
    expectedCurrentGenerationId: current?.generationId ?? null,
  })
}

let coordinator: RefreshJobCoordinator<CoreRefreshExecutionResult> | null = null

function getCoordinator(): RefreshJobCoordinator<CoreRefreshExecutionResult> {
  coordinator ??= new RefreshJobCoordinator(
    executeOwned,
    () => undefined,
    new RedisRefreshJobStore(cacheService.getRefreshJobCommandPort(), CORE_JOB_KEY),
    {
      leaseMs: CORE_LEASE_MS,
      heartbeatMs: CORE_HEARTBEAT_MS,
      ownerId: randomUUID,
    },
  )
  return coordinator
}

export async function executeCanonicalCoreRefresh(): Promise<CoreRefreshExecutionResult> {
  assertClarezaRefreshEnabled()
  getFmpApiKey()
  return getCoordinator().execute()
}
