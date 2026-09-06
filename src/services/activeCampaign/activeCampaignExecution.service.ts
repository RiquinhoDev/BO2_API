import { randomUUID } from 'node:crypto'
import type { FilterQuery } from 'mongoose'
import ActiveCampaignExecution, {
  type ActiveCampaignExecutionOperation,
  type IActiveCampaignExecution,
} from '../../models/ActiveCampaignExecution'
import { MAX_BULK_OPERATION_ITEMS } from '../../security/bulkOperationPolicy'
import { HttpError } from '../../security/errorHandling'
import { ACTIVE_CAMPAIGN_REQUEST_TIMEOUT_MS } from './activeCampaignTransport'

export const ACTIVE_CAMPAIGN_EXECUTION_LEASE_MS =
  MAX_BULK_OPERATION_ITEMS * ACTIVE_CAMPAIGN_REQUEST_TIMEOUT_MS * 2

export class ActiveCampaignExecutionLimitError extends HttpError {
  constructor() {
    super({
      status: 413,
      code: 'AC_ACTIVE_CAMPAIGN_LIMIT_EXCEEDED',
      publicMessage: `Execução ActiveCampaign limitada a ${MAX_BULK_OPERATION_ITEMS} itens`,
    })
  }
}

export class ActiveCampaignExecutionDisabledError extends HttpError {
  constructor() {
    super({
      status: 503,
      code: 'AC_ACTIVE_CAMPAIGN_EXECUTION_DISABLED',
      publicMessage: 'Execução ActiveCampaign desativada',
    })
  }
}

export class ActiveCampaignExecutionInProgressError extends HttpError {
  constructor() {
    super({
      status: 409,
      code: 'AC_ACTIVE_CAMPAIGN_EXECUTION_IN_PROGRESS',
      publicMessage: 'Execução ActiveCampaign já está em curso',
    })
  }
}

export class ActiveCampaignExecutionOwnershipError extends Error {
  readonly code = 'AC_ACTIVE_CAMPAIGN_EXECUTION_OWNERSHIP_LOST'

  constructor(operation: ActiveCampaignExecutionOperation) {
    super(`Execução ActiveCampaign perdeu a posse de ${operation}`)
    this.name = 'ActiveCampaignExecutionOwnershipError'
  }
}

export type ActiveCampaignExecutionClaim<T> =
  | { kind: 'claimed'; ownerId: string }
  | { kind: 'replay'; result: T }
  | { kind: 'in-progress' }

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 11000
}

type ExecutionSnapshot = Pick<
  IActiveCampaignExecution,
  'requestId' | 'ownerId' | 'status' | 'leaseExpiresAt' | 'result'
>

async function findExecution(
  filter: FilterQuery<IActiveCampaignExecution>,
): Promise<ExecutionSnapshot | null> {
  return ActiveCampaignExecution.findOne(filter)
    .select('requestId ownerId status leaseExpiresAt result')
    .lean<ExecutionSnapshot>()
}

function classifyExisting<T>(
  execution: ExecutionSnapshot | null,
  requestId: string,
  at: Date,
): ActiveCampaignExecutionClaim<T> | undefined {
  if (!execution) return undefined
  if (execution.status === 'running') {
    if (!execution.leaseExpiresAt || execution.leaseExpiresAt > at) return { kind: 'in-progress' }
    return undefined
  }
  if (execution.requestId === requestId && execution.result !== undefined) {
    return { kind: 'replay', result: execution.result as T }
  }
  return undefined
}

export async function claimActiveCampaignExecution<T>(
  operation: ActiveCampaignExecutionOperation,
  requestId: string,
  at = new Date(),
): Promise<ActiveCampaignExecutionClaim<T>> {
  const ownerId = randomUUID()
  const leaseExpiresAt = new Date(at.getTime() + ACTIVE_CAMPAIGN_EXECUTION_LEASE_MS)
  const claimUpdate = {
    $set: {
      operation,
      requestId,
      ownerId,
      status: 'running' as const,
      startedAt: at,
      leaseExpiresAt,
    },
    $unset: { finishedAt: 1, result: 1 },
  }
  const staleRunningFilter = {
    operation,
    status: 'running' as const,
    $or: [
      { leaseExpiresAt: { $lte: at } },
      { leaseExpiresAt: { $exists: false } },
    ],
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const exact = classifyExisting<T>(
      await findExecution({ operation, requestId }),
      requestId,
      at,
    )
    if (exact) return exact

    try {
      const reclaimed = await ActiveCampaignExecution.findOneAndUpdate(
        {
          operation,
          requestId,
          $or: [
            { status: 'failed' },
            { status: 'completed', result: { $exists: false } },
            staleRunningFilter,
          ],
        },
        claimUpdate,
        { new: true },
      )
      if (reclaimed) return { kind: 'claimed', ownerId }
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error
    }

    try {
      await ActiveCampaignExecution.findOneAndUpdate(
        staleRunningFilter,
        {
          $set: { status: 'failed', finishedAt: at },
          $unset: { leaseExpiresAt: 1 },
        },
        { new: true },
      )
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error
    }

    try {
      await ActiveCampaignExecution.create({
        operation,
        requestId,
        ownerId,
        status: 'running',
        startedAt: at,
        leaseExpiresAt,
      })
      return { kind: 'claimed', ownerId }
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error
    }
  }

  const exact = classifyExisting<T>(
    await findExecution({ operation, requestId }),
    requestId,
    at,
  )
  if (exact) return exact
  const running = classifyExisting<T>(
    await findExecution({ operation, status: 'running' }),
    requestId,
    at,
  )
  return running ?? { kind: 'in-progress' }
}

export async function completeActiveCampaignExecution<T>(
  operation: ActiveCampaignExecutionOperation,
  ownerId: string,
  result: T,
): Promise<void> {
  const updated = await ActiveCampaignExecution.findOneAndUpdate(
    { operation, ownerId, status: 'running' },
    {
      $set: { status: 'completed', finishedAt: new Date(), result },
      $unset: { leaseExpiresAt: 1 },
    },
    { new: true },
  )
  if (!updated) throw new ActiveCampaignExecutionOwnershipError(operation)
}

export async function failActiveCampaignExecution(
  operation: ActiveCampaignExecutionOperation,
  ownerId: string,
): Promise<void> {
  const updated = await ActiveCampaignExecution.findOneAndUpdate(
    { operation, ownerId, status: 'running' },
    {
      $set: { status: 'failed', finishedAt: new Date() },
      $unset: { leaseExpiresAt: 1 },
    },
    { new: true },
  )
  if (!updated) throw new ActiveCampaignExecutionOwnershipError(operation)
}

export function requestIdFrom(
  requestId: string | undefined,
): string {
  return requestId && requestId.length > 0 ? requestId : randomUUID()
}
