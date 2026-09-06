import { createHash, randomUUID } from 'node:crypto'
import type { FilterQuery } from 'mongoose'

import CompositeExecutionReceipt, {
  type CompositeExecutionOperation,
  type CompositeProviderStatus,
  type ICompositeExecutionReceipt,
} from '../../models/CompositeExecutionReceipt'
import {
  ActiveCampaignExecutionOwnershipError,
  startActiveCampaignExecutionLease,
  type ActiveCampaignExecutionLease,
} from '../activeCampaign/activeCampaignExecution.service'
import { HttpError } from '../../security/errorHandling'

export const COMPOSITE_EXECUTION_LEASE_MS = 180_000

export type CompositeExecutionOutcome<T> =
  | { kind: 'completed'; result: T }
  | { kind: 'replay'; result: T }
  | { kind: 'failed'; result: T }
  | { kind: 'in-progress' }
  | { kind: 'indeterminate' }
  | { kind: 'request-id-reused' }

export interface CompositeExecutionPhaseHooks {
  providerStarted(): void
  providerSucceeded(): void
  localMutationStarted(): void
}

export interface CompositeExecutionContext {
  lease: ActiveCampaignExecutionLease
  provider: {
    begin(): void
    success(): void
  }
  localMutation: {
    begin(): void
  }
}

export interface CompositeExecutionOptions<T> {
  operation: CompositeExecutionOperation
  identity: string
  actorId: string
  fingerprint: string
  requestId: string
  leaseMs?: number
  heartbeatMs?: number
  now?: () => Date
  run: (context: CompositeExecutionContext) => Promise<T>
}

type ReceiptSnapshot = Pick<
  ICompositeExecutionReceipt,
  'operation' | 'identity' | 'actorId' | 'fingerprint' | 'requestId' | 'ownerId' | 'status' | 'providerStatus' | 'leaseExpiresAt' | 'result'
>

type ReceiptClaim<T> =
  | { kind: 'claimed'; ownerId: string }
  | { kind: 'replay'; result: T }
  | { kind: 'in-progress' }
  | { kind: 'indeterminate' }
  | { kind: 'request-id-reused' }

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object'
  && error !== null
  && 'code' in error
  && error.code === 11000

async function findReceipt(
  filter: FilterQuery<ICompositeExecutionReceipt>,
): Promise<ReceiptSnapshot | null> {
  return CompositeExecutionReceipt.findOne(filter)
    .select('operation identity actorId fingerprint requestId ownerId status providerStatus leaseExpiresAt result')
    .lean<ReceiptSnapshot>()
    .exec()
}

function classifyExisting<T>(
  receipt: ReceiptSnapshot | null,
  options: CompositeExecutionOptions<T>,
  at: Date,
): ReceiptClaim<T> | undefined {
  if (!receipt) return undefined
  if (receipt.identity !== options.identity
    || receipt.actorId !== options.actorId
    || receipt.fingerprint !== options.fingerprint) {
    return { kind: 'request-id-reused' }
  }
  if (receipt.status === 'running') {
    if (!receipt.leaseExpiresAt || receipt.leaseExpiresAt > at) return { kind: 'in-progress' }
    return undefined
  }
  if (receipt.status === 'completed') return { kind: 'replay', result: receipt.result as T }
  if (receipt.status === 'indeterminate') return { kind: 'indeterminate' }
  return undefined
}

async function claimReceipt<T>(
  options: CompositeExecutionOptions<T>,
  at: Date,
  leaseMs: number,
): Promise<ReceiptClaim<T>> {
  // The active identity index is the cross-entry run lock. Wait for it before
  // the first claim so startup cannot race index creation.
  await CompositeExecutionReceipt.init()
  const ownerId = randomUUID()
  const leaseExpiresAt = new Date(at.getTime() + leaseMs)
  const claimUpdate = {
    $set: {
      operation: options.operation,
      identity: options.identity,
      actorId: options.actorId,
      fingerprint: options.fingerprint,
      requestId: options.requestId,
      ownerId,
      status: 'running' as const,
      providerStatus: 'not-started' as const,
      startedAt: at,
      leaseExpiresAt,
    },
    $unset: { finishedAt: 1, result: 1 },
  }
  const staleRunningFilter = {
    operation: options.operation,
    identity: options.identity,
    status: 'running' as const,
    $or: [
      { leaseExpiresAt: { $lte: at } },
      { leaseExpiresAt: { $exists: false } },
    ],
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existingRequest = await findReceipt({
      operation: options.operation,
      requestId: options.requestId,
    })
    const classified = classifyExisting(existingRequest, options, at)
    if (classified) return classified

    if (await findReceipt({
      operation: options.operation,
      identity: options.identity,
      status: 'indeterminate',
    })) {
      return { kind: 'indeterminate' }
    }

    try {
      const reclaimed = await CompositeExecutionReceipt.findOneAndUpdate(
        {
          operation: options.operation,
          identity: options.identity,
          actorId: options.actorId,
          fingerprint: options.fingerprint,
          requestId: options.requestId,
          status: 'failed',
        },
        claimUpdate,
        { new: true },
      ).exec()
      if (reclaimed) return { kind: 'claimed', ownerId }
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error
    }

    try {
      const stale = await CompositeExecutionReceipt.findOneAndUpdate(
        staleRunningFilter,
        {
          $set: { status: 'indeterminate', providerStatus: 'unknown', finishedAt: at },
          $unset: { leaseExpiresAt: 1 },
        },
        { new: true },
      ).exec()
      if (stale) return { kind: 'indeterminate' }
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error
    }

    if (await findReceipt({
      operation: options.operation,
      identity: options.identity,
      status: 'indeterminate',
    })) {
      return { kind: 'indeterminate' }
    }

    try {
      await CompositeExecutionReceipt.create({
        operation: options.operation,
        identity: options.identity,
        actorId: options.actorId,
        fingerprint: options.fingerprint,
        requestId: options.requestId,
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

  const existingRequest = await findReceipt({
    operation: options.operation,
    requestId: options.requestId,
  })
  const classified = classifyExisting(existingRequest, options, at)
  if (classified) return classified
  if (await findReceipt({
    operation: options.operation,
    identity: options.identity,
    status: 'indeterminate',
  })) {
    return { kind: 'indeterminate' }
  }
  return { kind: 'in-progress' }
}

async function renewReceipt(
  options: CompositeExecutionOptions<unknown>,
  ownerId: string,
  leaseMs: number,
  at: Date,
): Promise<void> {
  const updated = await CompositeExecutionReceipt.findOneAndUpdate(
    {
      operation: options.operation,
      identity: options.identity,
      requestId: options.requestId,
      ownerId,
      status: 'running',
      leaseExpiresAt: { $gt: at },
    },
    { $set: { leaseExpiresAt: new Date(at.getTime() + leaseMs) } },
    { new: true },
  ).exec()
  if (!updated) throw new ActiveCampaignExecutionOwnershipError('composite-execution')
}

async function settleReceipt(
  options: CompositeExecutionOptions<unknown>,
  ownerId: string,
  status: 'completed' | 'failed' | 'indeterminate',
  providerStatus: CompositeProviderStatus,
  result?: unknown,
  at = (options.now ?? (() => new Date()))(),
): Promise<void> {
  const updated = await CompositeExecutionReceipt.findOneAndUpdate(
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
        finishedAt: at,
        ...(status === 'completed' ? { result } : {}),
      },
      $unset: { leaseExpiresAt: 1 },
    },
    { new: true },
  ).exec()
  if (!updated) throw new ActiveCampaignExecutionOwnershipError('composite-execution')
}

export async function executeCompositeExecutionReceipt<T>(
  options: CompositeExecutionOptions<T>,
): Promise<CompositeExecutionOutcome<T>> {
  const leaseMs = options.leaseMs ?? COMPOSITE_EXECUTION_LEASE_MS
  const now = options.now ?? (() => new Date())
  const claimed = await claimReceipt(options, now(), leaseMs)
  if (claimed.kind !== 'claimed') return claimed

  let providerAttempted = false
  let providerSucceeded = false
  let localMutationStarted = false
  const provider = {
    begin(): void { providerAttempted = true },
    success(): void { providerSucceeded = true },
  }
  const localMutation = {
    begin(): void { localMutationStarted = true },
  }
  const lease = startActiveCampaignExecutionLease('composite-execution', claimed.ownerId, {
    intervalMs: options.heartbeatMs ?? Math.min(10_000, Math.max(1_000, Math.floor(leaseMs / 3))),
    now,
    renew: (at) => renewReceipt(options as CompositeExecutionOptions<unknown>, claimed.ownerId, leaseMs, at),
  })

  try {
    let result: T
    try {
      result = await lease.run(() => options.run({ lease, provider, localMutation }))
    } catch (error: unknown) {
      const providerStatus: CompositeProviderStatus = !providerAttempted
        ? 'not-started'
        : providerSucceeded ? 'succeeded' : 'unknown'
      const status = providerAttempted || localMutationStarted
        || error instanceof ActiveCampaignExecutionOwnershipError
        ? 'indeterminate'
        : 'failed'
      try {
        await settleReceipt(
          options as CompositeExecutionOptions<unknown>,
          claimed.ownerId,
          status,
          providerStatus,
          undefined,
          now(),
        )
      } catch {
        return { kind: 'indeterminate' }
      }
      if (status === 'indeterminate') return { kind: 'indeterminate' }
      throw error
    }

    if (providerAttempted && !providerSucceeded) {
      try {
        await settleReceipt(
          options as CompositeExecutionOptions<unknown>,
          claimed.ownerId,
          'indeterminate',
          'unknown',
          undefined,
          now(),
        )
      } catch {
        // Leave the lease fenced if Mongo cannot persist the terminal state.
      }
      return { kind: 'indeterminate' }
    }

    const businessFailure = typeof result === 'object'
      && result !== null
      && 'success' in result
      && (result as { success?: unknown }).success === false
    if (businessFailure) {
      const status = providerAttempted || localMutationStarted ? 'indeterminate' : 'failed'
      try {
        await settleReceipt(
          options as CompositeExecutionOptions<unknown>,
          claimed.ownerId,
          status,
          providerSucceeded ? 'succeeded' : providerAttempted ? 'unknown' : 'not-started',
          status === 'failed' ? result : undefined,
          now(),
        )
      } catch {
        return { kind: 'indeterminate' }
      }
      if (status === 'indeterminate') return { kind: 'indeterminate' }
      return { kind: 'failed', result }
    }

    try {
      await settleReceipt(
        options as CompositeExecutionOptions<unknown>,
        claimed.ownerId,
        'completed',
        providerSucceeded ? 'succeeded' : 'not-started',
        result,
        now(),
      )
    } catch {
      try {
        await settleReceipt(
          options as CompositeExecutionOptions<unknown>,
          claimed.ownerId,
          'indeterminate',
          providerSucceeded ? 'succeeded' : 'unknown',
          undefined,
          now(),
        )
      } catch {
        // The running lease remains fenced if Mongo is unavailable.
      }
      return { kind: 'indeterminate' }
    }
    return { kind: 'completed', result }
  } finally {
    lease.stop()
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  )
}

export function compositeExecutionFingerprint(actorId: string, payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue({ actorId, payload })))
    .digest('hex')
}

export async function runCompositeExecutionWithReceipt<T>(options: {
  operation: CompositeExecutionOperation
  identity: string
  actorId: string
  fingerprint: string
  requestId: string
  run: (hooks: CompositeExecutionPhaseHooks) => Promise<T>
  now?: () => Date
}): Promise<T> {
  const execution = await executeCompositeExecutionReceipt({
    operation: options.operation,
    identity: options.identity,
    actorId: options.actorId,
    fingerprint: options.fingerprint,
    requestId: options.requestId,
    now: options.now,
    run: async (context) => options.run({
      providerStarted: context.provider.begin,
      providerSucceeded: context.provider.success,
      localMutationStarted: context.localMutation.begin,
    }),
  })

  if (execution.kind === 'completed' || execution.kind === 'replay' || execution.kind === 'failed') {
    return execution.result
  }
  const operationLabel = options.operation === 'sync-pipeline' ? 'pipeline' : 'job'
  if (execution.kind === 'in-progress') {
    throw new HttpError({
      status: 409,
      code: 'COMPOSITE_EXECUTION_IN_PROGRESS',
      publicMessage: `Este ${operationLabel} já está em processamento`,
    })
  }
  if (execution.kind === 'request-id-reused') {
    throw new HttpError({
      status: 409,
      code: 'COMPOSITE_EXECUTION_REQUEST_ID_REUSED',
      publicMessage: 'X-Request-ID já foi usado com outra execução',
    })
  }
  throw new HttpError({
    status: 503,
    code: 'COMPOSITE_EXECUTION_INDETERMINATE',
    publicMessage: `Resultado do ${operationLabel} ficou indeterminado; requer reconciliação`,
  })
}
