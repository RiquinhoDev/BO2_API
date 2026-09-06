import { randomUUID } from 'node:crypto'
import type { FilterQuery } from 'mongoose'

import GuruCurseducaInactivationReceipt, {
  type GuruCurseducaInactivationProviderStatus,
  type GuruCurseducaInactivationReceiptOperation,
  type IGuruCurseducaInactivationReceipt,
} from '../../models/GuruCurseducaInactivationReceipt'
import {
  ActiveCampaignExecutionOwnershipError,
  startActiveCampaignExecutionLease,
  type ActiveCampaignExecutionLease,
} from '../activeCampaign/activeCampaignExecution.service'

export type GuruCurseducaInactivationExecutionOutcome<T> =
  | { kind: 'completed'; result: T }
  | { kind: 'replay'; result: T }
  | { kind: 'in-progress' }
  | { kind: 'indeterminate' }
  | { kind: 'request-id-reused' }

export interface GuruCurseducaInactivationExecutionContext {
  lease: ActiveCampaignExecutionLease
  provider: {
    begin(): void
    notAttempted(): void
    success(): void
    retryableFailure(): void
  }
}

export interface GuruCurseducaInactivationExecutionOptions<T> {
  operation: GuruCurseducaInactivationReceiptOperation
  identity: string
  requestId: string
  leaseMs: number
  heartbeatMs?: number
  now: () => Date
  run: (context: GuruCurseducaInactivationExecutionContext) => Promise<T>
}

type ReceiptSnapshot = Pick<
  IGuruCurseducaInactivationReceipt,
  'identity' | 'requestId' | 'ownerId' | 'status' | 'providerStatus' | 'leaseExpiresAt' | 'result'
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
  filter: FilterQuery<IGuruCurseducaInactivationReceipt>,
): Promise<ReceiptSnapshot | null> {
  return GuruCurseducaInactivationReceipt.findOne(filter)
    .select('identity requestId ownerId status providerStatus leaseExpiresAt result')
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
  options: GuruCurseducaInactivationExecutionOptions<T>,
): Promise<ReceiptClaim<T>> {
  const { operation, identity, requestId, leaseMs } = options
  const at = options.now()
  const ownerId = randomUUID()
  const leaseExpiresAt = new Date(at.getTime() + leaseMs)
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

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reused = await findReceipt({ operation, requestId, identity: { $ne: identity } })
    if (reused) return { kind: 'request-id-reused' }

    const exact = classifyReceipt<T>(
      await findReceipt({ operation, identity, requestId }),
      requestId,
      at,
    )
    if (exact) return exact

    const indeterminate = await findReceipt({ operation, identity, status: 'indeterminate' })
    if (indeterminate) return { kind: 'indeterminate' }

    try {
      const reclaimed = await GuruCurseducaInactivationReceipt.findOneAndUpdate(
        { operation, identity, requestId, status: 'failed' },
        claimUpdate,
        { new: true },
      )
      if (reclaimed) return { kind: 'claimed', ownerId }
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error
    }

    try {
      const stale = await GuruCurseducaInactivationReceipt.findOneAndUpdate(
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
      await GuruCurseducaInactivationReceipt.create({
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

  const reused = await findReceipt({ operation, requestId, identity: { $ne: identity } })
  if (reused) return { kind: 'request-id-reused' }
  const exact = classifyReceipt<T>(
    await findReceipt({ operation, identity, requestId }),
    requestId,
    at,
  )
  if (exact) return exact
  if (await findReceipt({ operation, identity, status: 'indeterminate' })) {
    return { kind: 'indeterminate' }
  }
  return { kind: 'in-progress' }
}

async function renewReceipt(
  operation: GuruCurseducaInactivationReceiptOperation,
  identity: string,
  requestId: string,
  ownerId: string,
  leaseMs: number,
  at: Date,
): Promise<void> {
  const updated = await GuruCurseducaInactivationReceipt.findOneAndUpdate(
    {
      operation,
      identity,
      requestId,
      ownerId,
      status: 'running',
      leaseExpiresAt: { $gt: at },
    },
    { $set: { leaseExpiresAt: new Date(at.getTime() + leaseMs) } },
    { new: true },
  )
  if (!updated) throw new Error('Guru CursEduca receipt ownership lost')
}

async function settleReceipt(
  options: GuruCurseducaInactivationExecutionOptions<unknown>,
  ownerId: string,
  status: 'completed' | 'failed' | 'indeterminate',
  providerStatus: GuruCurseducaInactivationProviderStatus,
  result?: unknown,
): Promise<void> {
  const updated = await GuruCurseducaInactivationReceipt.findOneAndUpdate(
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
        finishedAt: options.now(),
        ...(status === 'completed' ? { result } : {}),
      },
      $unset: { leaseExpiresAt: 1 },
    },
    { new: true },
  )
  if (!updated) throw new Error('Guru CursEduca receipt ownership lost')
}

export async function executeGuruCurseducaInactivation<T>(
  options: GuruCurseducaInactivationExecutionOptions<T>,
): Promise<GuruCurseducaInactivationExecutionOutcome<T>> {
  const claimed = await claimReceipt(options)
  if (claimed.kind !== 'claimed') return claimed

  let providerAttempted = false
  let providerSucceeded = false
  let retryableProviderFailure = false
  const provider = {
    begin(): void {
      providerAttempted = true
    },
    notAttempted(): void {
      providerAttempted = false
    },
    success(): void {
      providerSucceeded = true
    },
    retryableFailure(): void {
      retryableProviderFailure = true
    },
  }
  const lease = startActiveCampaignExecutionLease('guru-curseduca-inactivation', claimed.ownerId, {
    intervalMs: options.heartbeatMs
      ?? Math.min(10_000, Math.max(1_000, Math.floor(options.leaseMs / 3))),
    now: options.now,
    renew: (at) => renewReceipt(
      options.operation,
      options.identity,
      options.requestId,
      claimed.ownerId,
      options.leaseMs,
      at,
    ),
  })

  try {
    let result: T
    try {
      result = await lease.run(() => options.run({ lease, provider }))
    } catch (error: unknown) {
      const providerStatus: GuruCurseducaInactivationProviderStatus = !providerAttempted
        ? 'not-started'
        : providerSucceeded
          ? 'succeeded'
          : 'unknown'
      const ownershipLost = error instanceof ActiveCampaignExecutionOwnershipError
      const status = ownershipLost || (providerAttempted && !retryableProviderFailure)
        ? 'indeterminate'
        : 'failed'
      try {
        await settleReceipt(
          options as GuruCurseducaInactivationExecutionOptions<unknown>,
          claimed.ownerId,
          status,
          providerStatus,
        )
      } catch {
        return { kind: 'indeterminate' }
      }
      if (status === 'indeterminate') return { kind: 'indeterminate' }
      throw error
    }

    try {
      if (providerAttempted && !providerSucceeded && !retryableProviderFailure) {
        try {
          await settleReceipt(
            options as GuruCurseducaInactivationExecutionOptions<unknown>,
            claimed.ownerId,
            'indeterminate',
            'unknown',
          )
        } catch {
          // The receipt remains running and will be fenced by its lease if Mongo is unavailable.
        }
        return { kind: 'indeterminate' }
      }
      await settleReceipt(
        options as GuruCurseducaInactivationExecutionOptions<unknown>,
        claimed.ownerId,
        retryableProviderFailure ? 'failed' : 'completed',
        providerSucceeded ? 'succeeded' : 'not-started',
        retryableProviderFailure ? undefined : result,
      )
    } catch {
      try {
        await settleReceipt(
          options as GuruCurseducaInactivationExecutionOptions<unknown>,
          claimed.ownerId,
          'indeterminate',
          providerSucceeded ? 'succeeded' : 'unknown',
        )
      } catch {
        // The receipt is unsafe to replay; keep the public result honest.
      }
      return { kind: 'indeterminate' }
    }
    return { kind: 'completed', result }
  } finally {
    lease.stop()
  }
}
