import { randomUUID } from 'node:crypto'
import type { FilterQuery } from 'mongoose'

import DiscordMessageExecutionReceipt, {
  type DiscordMessageExecutionOperation,
  type DiscordMessageProviderStatus,
  type IDiscordMessageExecutionReceipt,
} from '../../../models/DiscordMessageExecutionReceipt'
import {
  ActiveCampaignExecutionOwnershipError,
  startActiveCampaignExecutionLease,
  type ActiveCampaignExecutionLease,
} from '../../activeCampaign/activeCampaignExecution.service'

export const DISCORD_MESSAGE_EXECUTION_LEASE_MS = 180_000

export type DiscordMessageExecutionOutcome<T> =
  | { kind: 'completed'; result: T }
  | { kind: 'replay'; result: T }
  | { kind: 'failed'; result: T }
  | { kind: 'in-progress' }
  | { kind: 'indeterminate' }
  | { kind: 'request-id-reused' }

export interface DiscordMessageExecutionContext {
  lease: ActiveCampaignExecutionLease
  provider: {
    begin(): void
    notAttempted(): void
    success(): void
    retryableFailure(): void
  }
}

export interface DiscordMessageExecutionOptions<T> {
  operation: DiscordMessageExecutionOperation
  identity: string
  requestId: string
  leaseMs?: number
  heartbeatMs?: number
  now?: () => Date
  run: (context: DiscordMessageExecutionContext) => Promise<T>
}

type ReceiptSnapshot = Pick<
  IDiscordMessageExecutionReceipt,
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
  filter: FilterQuery<IDiscordMessageExecutionReceipt>,
): Promise<ReceiptSnapshot | null> {
  return DiscordMessageExecutionReceipt.findOne(filter)
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
  options: DiscordMessageExecutionOptions<T>,
  at: Date,
  leaseMs: number,
): Promise<ReceiptClaim<T>> {
  const { operation, identity, requestId } = options
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

    if (await findReceipt({ operation, identity, status: 'indeterminate' })) {
      return { kind: 'indeterminate' }
    }

    try {
      const reclaimed = await DiscordMessageExecutionReceipt.findOneAndUpdate(
        { operation, identity, requestId, status: 'failed' },
        claimUpdate,
        { new: true },
      )
      if (reclaimed) return { kind: 'claimed', ownerId }
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error
    }

    try {
      const stale = await DiscordMessageExecutionReceipt.findOneAndUpdate(
        staleRunningFilter,
        {
          $set: { status: 'indeterminate', providerStatus: 'unknown', finishedAt: at },
          $unset: { leaseExpiresAt: 1 },
        },
        { new: true },
      )
      if (stale) return { kind: 'indeterminate' }
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error
    }

    if (await findReceipt({ operation, identity, status: 'indeterminate' })) {
      return { kind: 'indeterminate' }
    }

    try {
      await DiscordMessageExecutionReceipt.create({
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
  options: DiscordMessageExecutionOptions<unknown>,
  ownerId: string,
  leaseMs: number,
  at: Date,
): Promise<void> {
  const updated = await DiscordMessageExecutionReceipt.findOneAndUpdate(
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
  )
  if (!updated) throw new ActiveCampaignExecutionOwnershipError('discord-message')
}

async function settleReceipt(
  options: DiscordMessageExecutionOptions<unknown>,
  ownerId: string,
  status: 'completed' | 'failed' | 'indeterminate',
  providerStatus: DiscordMessageProviderStatus,
  result?: unknown,
): Promise<void> {
  const updated = await DiscordMessageExecutionReceipt.findOneAndUpdate(
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
        finishedAt: (options.now ?? (() => new Date()))(),
        ...(status === 'completed' ? { result } : {}),
      },
      $unset: { leaseExpiresAt: 1 },
    },
    { new: true },
  )
  if (!updated) throw new ActiveCampaignExecutionOwnershipError('discord-message')
}

export async function executeDiscordMessageReceipt<T>(
  options: DiscordMessageExecutionOptions<T>,
): Promise<DiscordMessageExecutionOutcome<T>> {
  const leaseMs = options.leaseMs ?? DISCORD_MESSAGE_EXECUTION_LEASE_MS
  const now = options.now ?? (() => new Date())
  const claimed = await claimReceipt(options, now(), leaseMs)
  if (claimed.kind !== 'claimed') return claimed

  let providerAttempted = false
  let providerSucceeded = false
  let retryableProviderFailure = false
  const provider = {
    begin(): void { providerAttempted = true },
    notAttempted(): void { providerAttempted = false },
    success(): void { providerSucceeded = true },
    retryableFailure(): void { retryableProviderFailure = true },
  }
  const lease = startActiveCampaignExecutionLease('discord-message', claimed.ownerId, {
    intervalMs: options.heartbeatMs ?? Math.min(10_000, Math.max(1_000, Math.floor(leaseMs / 3))),
    now,
    renew: (at) => renewReceipt(options as DiscordMessageExecutionOptions<unknown>, claimed.ownerId, leaseMs, at),
  })

  try {
    let result: T
    try {
      result = await lease.run(() => options.run({ lease, provider }))
    } catch (error: unknown) {
      const providerStatus: DiscordMessageProviderStatus = !providerAttempted
        ? 'not-started'
        : providerSucceeded ? 'succeeded' : 'unknown'
      const status = providerAttempted && !retryableProviderFailure ? 'indeterminate' : 'failed'
      try {
        await settleReceipt(
          options as DiscordMessageExecutionOptions<unknown>,
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

    if (providerAttempted && !providerSucceeded && !retryableProviderFailure) {
      try {
        await settleReceipt(
          options as DiscordMessageExecutionOptions<unknown>,
          claimed.ownerId,
          'indeterminate',
          'unknown',
        )
      } catch {
        // Keep running until the lease expires when Mongo cannot persist the fence.
      }
      return { kind: 'indeterminate' }
    }

    try {
      await settleReceipt(
        options as DiscordMessageExecutionOptions<unknown>,
        claimed.ownerId,
        retryableProviderFailure ? 'failed' : 'completed',
        providerSucceeded ? 'succeeded' : 'not-started',
        retryableProviderFailure ? undefined : result,
      )
    } catch {
      try {
        await settleReceipt(
          options as DiscordMessageExecutionOptions<unknown>,
          claimed.ownerId,
          'indeterminate',
          providerSucceeded ? 'succeeded' : 'unknown',
        )
      } catch {
        // The running lease remains fenced if the database is unavailable.
      }
      return { kind: 'indeterminate' }
    }
    return retryableProviderFailure
      ? { kind: 'failed', result }
      : { kind: 'completed', result }
  } finally {
    lease.stop()
  }
}
