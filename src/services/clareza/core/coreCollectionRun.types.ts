export type CoreCollectionRunStatus = 'pending' | 'running' | 'completed'

export interface CoreRunFailure {
  readonly key: string
  readonly errorCode: string
}

export interface CoreRunCollectedItem {
  readonly key: string
  readonly data: unknown
}

export interface CoreCollectionRun {
  readonly runId: string
  readonly generationId: string
  readonly universeVersion: string
  readonly itemKeys: readonly string[]
  readonly status: CoreCollectionRunStatus
  readonly nextIndex: number
  readonly successfulItems: readonly string[]
  readonly collectedItems: readonly CoreRunCollectedItem[]
  readonly failedItems: readonly CoreRunFailure[]
  readonly ownerId: string | null
  readonly leaseUntil: Date | null
  readonly revision: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CreateCoreRunInput {
  readonly runId: string
  readonly generationId: string
  readonly universeVersion: string
  readonly itemKeys: readonly string[]
  readonly now: Date
}

export interface CompleteCoreBatchInput {
  readonly runId: string
  readonly ownerId: string
  readonly expectedRevision: number
  readonly nextIndex: number
  readonly successfulItems: readonly string[]
  readonly collectedItems: readonly CoreRunCollectedItem[]
  readonly failedItems: readonly CoreRunFailure[]
  readonly completed: boolean
  readonly now: Date
}

export interface CoreCollectionRunStore {
  create(input: CreateCoreRunInput): Promise<CoreCollectionRun>
  read(runId: string): Promise<CoreCollectionRun | null>
  claim(runId: string, ownerId: string, now: Date, leaseMs: number): Promise<CoreCollectionRun | null>
  completeBatch(input: CompleteCoreBatchInput): Promise<CoreCollectionRun | null>
}
