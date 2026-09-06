import { createHash, randomUUID } from 'node:crypto'
import type { FilterQuery } from 'mongoose'

import ActiveCampaignProductTagReceipt, {
  type ActiveCampaignProductTagReceiptOperation,
  type ActiveCampaignProductTagProviderStatus,
  type IActiveCampaignProductTagReceipt,
} from '../../models/ActiveCampaignProductTagReceipt'
import { HttpError } from '../../security/errorHandling'
import {
  ACTIVE_CAMPAIGN_EXECUTION_LEASE_MS,
  startActiveCampaignExecutionLease,
  type ActiveCampaignExecutionLease,
} from './activeCampaignExecution.service'

export type ActiveCampaignProductTagExecutionOperation =
  ActiveCampaignProductTagReceiptOperation

export class ActiveCampaignProductTagMutationInProgressError extends HttpError {
  constructor() {
    super({
      status: 409,
      code: 'AC_PRODUCT_TAG_MUTATION_IN_PROGRESS',
      publicMessage: 'Mutação de tag ActiveCampaign já está em processamento',
    })
  }
}

export class ActiveCampaignProductTagMutationIndeterminateError extends HttpError {
  constructor(cause?: unknown) {
    super({
      status: 503,
      code: 'AC_PRODUCT_TAG_MUTATION_INDETERMINATE',
      publicMessage: 'Resultado da mutação ActiveCampaign ficou indeterminado; requer reconciliação',
      cause,
    })
  }
}

export type ActiveCampaignProductTagExecutionOutcome<T> =
  | { kind: 'completed'; result: T }
  | { kind: 'replay'; result: T }
  | { kind: 'in-progress' }
  | { kind: 'indeterminate' }

export interface ActiveCampaignProductTagExecutionContext {
  lease: ActiveCampaignExecutionLease
  provider: {
    begin(): void
    success(): void
  }
}

export interface ActiveCampaignProductTagExecutionOptions<T> {
  operation: ActiveCampaignProductTagExecutionOperation
  identity: string
  requestId: string
  run: (context: ActiveCampaignProductTagExecutionContext) => Promise<T>
}

type ReceiptSnapshot = Pick<
  IActiveCampaignProductTagReceipt,
  'requestId' | 'ownerId' | 'status' | 'providerStatus' | 'leaseExpiresAt' | 'result'
>

type ReceiptClaim<T> =
  | { kind: 'claimed'; ownerId: string }
  | { kind: 'replay'; result: T }
  | { kind: 'in-progress' }
  | { kind: 'indeterminate' }

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 11000
}

async function findReceipt(
  filter: FilterQuery<IActiveCampaignProductTagReceipt>,
): Promise<ReceiptSnapshot | null> {
  return ActiveCampaignProductTagReceipt.findOne(filter)
    .select('requestId ownerId status providerStatus leaseExpiresAt result')
    .lean<ReceiptSnapshot>()
}

function classifyReceipt<T>(
  receipt: ReceiptSnapshot | null,
  requestId: string,
  at: Date,
): ReceiptClaim<T> | undefined {
  if (!receipt) return undefined
  if (receipt.status === 'running') {
    if (!receipt.leaseExpiresAt || receipt.leaseExpiresAt > at) return { kind: 'in-progress' }
    return undefined
  }
  if (receipt.requestId === requestId && receipt.status === 'completed') {
    return { kind: 'replay', result: receipt.result as T }
  }
  if (receipt.requestId === requestId && receipt.status === 'indeterminate') {
    return { kind: 'indeterminate' }
  }
  return undefined
}

async function claimReceipt<T>(
  operation: ActiveCampaignProductTagExecutionOperation,
  identity: string,
  requestId: string,
  at = new Date(),
): Promise<ReceiptClaim<T>> {
  const ownerId = randomUUID()
  const leaseExpiresAt = new Date(at.getTime() + ACTIVE_CAMPAIGN_EXECUTION_LEASE_MS)
  const claimUpdate = {
    $set: {
      operation,
      identity,
      requestId,
      ownerId,
      status: 'running' as const,
      providerStatus: 'not-started' as const,
      startedAt: at,
      leaseExpiresAt,
    },
    $unset: { finishedAt: 1, result: 1 },
  }
  const staleRunningFilter = {
    operation,
    identity,
    status: 'running' as const,
    $or: [
      { leaseExpiresAt: { $lte: at } },
      { leaseExpiresAt: { $exists: false } },
    ],
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const exact = classifyReceipt<T>(
      await findReceipt({ operation, identity, requestId }),
      requestId,
      at,
    )
    if (exact) return exact

    const indeterminate = await findReceipt({ operation, identity, status: 'indeterminate' })
    if (indeterminate) return { kind: 'indeterminate' }

    try {
      const reclaimed = await ActiveCampaignProductTagReceipt.findOneAndUpdate(
        {
          operation,
          identity,
          requestId,
          status: 'failed',
        },
        claimUpdate,
        { new: true },
      )
      if (reclaimed) return { kind: 'claimed', ownerId }
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error
    }

    try {
      const stale = await ActiveCampaignProductTagReceipt.findOneAndUpdate(
        staleRunningFilter,
        {
          $set: {
            status: 'indeterminate',
            providerStatus: 'unknown',
            finishedAt: at,
          },
          $unset: { leaseExpiresAt: 1 },
        },
        { new: true },
      )
      if (stale) return { kind: 'indeterminate' }
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error
    }

    const indeterminateAfterStaleCheck = await findReceipt({
      operation,
      identity,
      status: 'indeterminate',
    })
    if (indeterminateAfterStaleCheck) return { kind: 'indeterminate' }

    try {
      await ActiveCampaignProductTagReceipt.create({
        operation,
        identity,
        requestId,
        ownerId,
        status: 'running',
        providerStatus: 'not-started',
        startedAt: at,
        leaseExpiresAt,
      })
      return { kind: 'claimed', ownerId }
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error
    }
  }

  const exact = classifyReceipt<T>(
    await findReceipt({ operation, identity, requestId }),
    requestId,
    at,
  )
  if (exact) return exact
  const indeterminate = await findReceipt({ operation, identity, status: 'indeterminate' })
  if (indeterminate) return { kind: 'indeterminate' }
  const running = classifyReceipt<T>(
    await findReceipt({ operation, identity, status: 'running' }),
    requestId,
    at,
  )
  return running ?? { kind: 'in-progress' }
}

async function renewReceipt(
  operation: ActiveCampaignProductTagExecutionOperation,
  identity: string,
  requestId: string,
  ownerId: string,
  at: Date,
): Promise<void> {
  const updated = await ActiveCampaignProductTagReceipt.findOneAndUpdate(
    {
      operation,
      identity,
      requestId,
      ownerId,
      status: 'running',
      leaseExpiresAt: { $gt: at },
    },
    { $set: { leaseExpiresAt: new Date(at.getTime() + ACTIVE_CAMPAIGN_EXECUTION_LEASE_MS) } },
    { new: true },
  )
  if (!updated) throw new Error('ActiveCampaign product-tag receipt ownership lost')
}

async function settleReceipt(
  options: ActiveCampaignProductTagExecutionOptions<unknown>,
  ownerId: string,
  status: 'completed' | 'failed' | 'indeterminate',
  providerStatus: ActiveCampaignProductTagProviderStatus,
  result?: unknown,
): Promise<void> {
  const updated = await ActiveCampaignProductTagReceipt.findOneAndUpdate(
    {
      operation: options.operation,
      identity: options.identity,
      requestId: options.requestId,
      ownerId,
      status: 'running',
    },
    {
      $set: {
        status,
        providerStatus,
        finishedAt: new Date(),
        ...(status === 'completed' ? { result } : {}),
      },
      $unset: { leaseExpiresAt: 1 },
    },
    { new: true },
  )
  if (!updated) throw new Error('ActiveCampaign product-tag receipt ownership lost')
}

function identityPart(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

export function activeCampaignProductTagIdentity(
  userProductId: unknown,
  operationKey: string,
): string {
  return createHash('sha256')
    .update(`${identityPart(userProductId)}:${operationKey}`)
    .digest('hex')
}

export async function executeActiveCampaignProductTag<T>(
  options: ActiveCampaignProductTagExecutionOptions<T>,
): Promise<ActiveCampaignProductTagExecutionOutcome<T>> {
  const claimed = await claimReceipt<T>(
    options.operation,
    options.identity,
    options.requestId,
  )
  if (claimed.kind !== 'claimed') return claimed

  let providerAttempted = false
  let providerInFlight = false
  let providerSucceeded = false
  const provider = {
    begin(): void {
      providerAttempted = true
      providerInFlight = true
    },
    success(): void {
      providerInFlight = false
      providerSucceeded = true
    },
  }
  const lease = startActiveCampaignExecutionLease('activecampaign-product-tag', claimed.ownerId, {
    renew: (at) => renewReceipt(
      options.operation,
      options.identity,
      options.requestId,
      claimed.ownerId,
      at,
    ),
  })

  try {
    let result: T
    try {
      result = await lease.run(() => options.run({ lease, provider }))
    } catch (error: unknown) {
      const providerStatus: ActiveCampaignProductTagProviderStatus = !providerAttempted
        ? 'not-started'
        : providerInFlight
          ? 'unknown'
          : providerSucceeded
            ? 'succeeded'
            : 'unknown'
      await settleReceipt(
        options as ActiveCampaignProductTagExecutionOptions<unknown>,
        claimed.ownerId,
        providerAttempted ? 'indeterminate' : 'failed',
        providerStatus,
      )
      if (error instanceof ActiveCampaignProductTagMutationInProgressError) {
        return { kind: 'in-progress' }
      }
      if (providerAttempted) return { kind: 'indeterminate' }
      throw error
    }

    try {
      await settleReceipt(
        options as ActiveCampaignProductTagExecutionOptions<unknown>,
        claimed.ownerId,
        'completed',
        providerSucceeded ? 'succeeded' : 'not-started',
        result,
      )
    } catch {
      try {
        await settleReceipt(
          options as ActiveCampaignProductTagExecutionOptions<unknown>,
          claimed.ownerId,
          'indeterminate',
          providerSucceeded ? 'succeeded' : 'unknown',
        )
      } catch {
        // The receipt is already unsafe to replay; keep the public result honest.
      }
      return { kind: 'indeterminate' }
    }
    return { kind: 'completed', result }
  } finally {
    lease.stop()
  }
}
