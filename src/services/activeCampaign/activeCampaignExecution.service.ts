import { randomUUID } from 'node:crypto'
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

async function findExecution(
  operation: ActiveCampaignExecutionOperation,
): Promise<Pick<IActiveCampaignExecution, 'requestId' | 'ownerId' | 'status' | 'leaseExpiresAt' | 'result'> | null> {
  return ActiveCampaignExecution.findOne({ operation })
    .select('requestId ownerId status leaseExpiresAt result')
    .lean<Pick<IActiveCampaignExecution, 'requestId' | 'ownerId' | 'status' | 'leaseExpiresAt' | 'result'>>()
}

function classifyExisting<T>(
  execution: Pick<IActiveCampaignExecution, 'requestId' | 'ownerId' | 'status' | 'leaseExpiresAt' | 'result'> | null,
  requestId: string,
  at: Date,
): ActiveCampaignExecutionClaim<T> | undefined {
  if (!execution) return undefined
  if (execution.status === 'running' && execution.leaseExpiresAt && execution.leaseExpiresAt > at) {
    return { kind: 'in-progress' }
  }
  if (execution.status !== 'running' && execution.requestId === requestId && execution.result !== undefined) {
    return { kind: 'replay', result: execution.result as T }
  }
  return undefined
}

export async function claimActiveCampaignExecution<T>(
  operation: ActiveCampaignExecutionOperation,
  requestId: string,
  at = new Date(),
): Promise<ActiveCampaignExecutionClaim<T>> {
  const existing = classifyExisting<T>(await findExecution(operation), requestId, at)
  if (existing) return existing

  const ownerId = randomUUID()
  const leaseExpiresAt = new Date(at.getTime() + ACTIVE_CAMPAIGN_EXECUTION_LEASE_MS)

  try {
    const claimed = await ActiveCampaignExecution.findOneAndUpdate(
      {
        operation,
        $or: [
          { status: 'failed' },
          { status: 'completed', requestId: { $ne: requestId } },
          { status: 'running', leaseExpiresAt: { $lte: at } },
        ],
      },
      {
        $set: {
          operation,
          requestId,
          ownerId,
          status: 'running',
          startedAt: at,
          leaseExpiresAt,
        },
        $unset: { finishedAt: 1, result: 1 },
      },
      { new: true, upsert: true },
    )

    if (claimed) return { kind: 'claimed', ownerId }
  } catch (error: unknown) {
    if (!isDuplicateKey(error)) throw error
  }

  const current = classifyExisting<T>(await findExecution(operation), requestId, at)
  return current ?? { kind: 'in-progress' }
}

export async function completeActiveCampaignExecution<T>(
  operation: ActiveCampaignExecutionOperation,
  ownerId: string,
  result: T,
): Promise<void> {
  await ActiveCampaignExecution.findOneAndUpdate(
    { operation, ownerId, status: 'running' },
    {
      $set: { status: 'completed', finishedAt: new Date(), result },
      $unset: { leaseExpiresAt: 1 },
    },
  )
}

export async function failActiveCampaignExecution(
  operation: ActiveCampaignExecutionOperation,
  ownerId: string,
): Promise<void> {
  await ActiveCampaignExecution.findOneAndUpdate(
    { operation, ownerId, status: 'running' },
    {
      $set: { status: 'failed', finishedAt: new Date() },
      $unset: { leaseExpiresAt: 1 },
    },
  )
}

export function requestIdFrom(
  requestId: string | undefined,
): string {
  return requestId && requestId.length > 0 ? requestId : randomUUID()
}
