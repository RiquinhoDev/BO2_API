import { randomUUID } from 'node:crypto'
import type { FilterQuery } from 'mongoose'

import ClarezaRefreshExecutionReceipt, {
  type ClarezaRefreshExecutionOperation,
  type ClarezaRefreshProviderStatus,
  type IClarezaRefreshExecutionReceipt,
} from '../../models/ClarezaRefreshExecutionReceipt'
import {
  ActiveCampaignExecutionOwnershipError,
  startActiveCampaignExecutionLease,
  type ActiveCampaignExecutionLease,
} from '../activeCampaign/activeCampaignExecution.service'
import { HttpError } from '../../security/errorHandling'
import { getOptionalFmpApiKey } from '../requestDrivenRuntimeConfig'

export const CLAREZA_REFRESH_EXECUTION_LEASE_MS = 180_000

export type ClarezaRefreshExecutionOutcome<T> =
  | { kind: 'completed'; result: T }
  | { kind: 'replay'; result: T }
  | { kind: 'failed'; result: T }
  | { kind: 'in-progress' }
  | { kind: 'indeterminate' }
  | { kind: 'request-id-reused' }

export interface ClarezaRefreshExecutionContext {
  lease: ActiveCampaignExecutionLease
  provider: {
    begin(): void
    notAttempted(): void
    success(): void
    retryableFailure(): void
  }
  localMutation: {
    begin(): void
  }
}

export interface ClarezaRefreshPhaseHooks {
  assertOwnership(): void
  providerStarted(): void
  providerSucceeded(): void
  localMutationStarted(): void
}

export interface ClarezaRefreshExecutionOptions<T> {
  operation: ClarezaRefreshExecutionOperation
  identity: string
  fingerprint: string
  requestId: string
  leaseMs?: number
  heartbeatMs?: number
  now?: () => Date
  run: (context: ClarezaRefreshExecutionContext) => Promise<T>
}

type ReceiptSnapshot = Pick<
  IClarezaRefreshExecutionReceipt,
  'operation' | 'identity' | 'fingerprint' | 'requestId' | 'ownerId' | 'status' | 'providerStatus' | 'leaseExpiresAt' | 'result'
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
  filter: FilterQuery<IClarezaRefreshExecutionReceipt>,
): Promise<ReceiptSnapshot | null> {
  return ClarezaRefreshExecutionReceipt.findOne(filter)
    .select('operation identity fingerprint requestId ownerId status providerStatus leaseExpiresAt result')
    .lean<ReceiptSnapshot>()
    .exec()
}

function classifyExisting<T>(
  receipt: ReceiptSnapshot | null,
  options: ClarezaRefreshExecutionOptions<T>,
  at: Date,
): ReceiptClaim<T> | undefined {
  if (!receipt) return undefined
  if (receipt.identity !== options.identity || receipt.fingerprint !== options.fingerprint) {
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
  options: ClarezaRefreshExecutionOptions<T>,
  at: Date,
  leaseMs: number,
): Promise<ReceiptClaim<T>> {
  // The partial unique fence is a correctness boundary. Do not attempt a
  // claim while Mongo is still building this model's indexes after startup.
  await ClarezaRefreshExecutionReceipt.init()
  const ownerId = randomUUID()
  const leaseExpiresAt = new Date(at.getTime() + leaseMs)
  const claimUpdate = {
    $set: {
      operation: options.operation,
      identity: options.identity,
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
    fingerprint: options.fingerprint,
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
      fingerprint: options.fingerprint,
      status: 'indeterminate',
    })) {
      return { kind: 'indeterminate' }
    }

    try {
      const reclaimed = await ClarezaRefreshExecutionReceipt.findOneAndUpdate(
        {
          operation: options.operation,
          identity: options.identity,
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
      const stale = await ClarezaRefreshExecutionReceipt.findOneAndUpdate(
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
      fingerprint: options.fingerprint,
      status: 'indeterminate',
    })) {
      return { kind: 'indeterminate' }
    }

    try {
      await ClarezaRefreshExecutionReceipt.create({
        operation: options.operation,
        identity: options.identity,
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
    fingerprint: options.fingerprint,
    status: 'indeterminate',
  })) {
    return { kind: 'indeterminate' }
  }
  return { kind: 'in-progress' }
}

async function renewReceipt(
  options: ClarezaRefreshExecutionOptions<unknown>,
  ownerId: string,
  leaseMs: number,
  at: Date,
): Promise<void> {
  const updated = await ClarezaRefreshExecutionReceipt.findOneAndUpdate(
    {
      operation: options.operation,
      identity: options.identity,
      fingerprint: options.fingerprint,
      requestId: options.requestId,
      ownerId,
      status: 'running',
      leaseExpiresAt: { $gt: at },
    },
    { $set: { leaseExpiresAt: new Date(at.getTime() + leaseMs) } },
    { new: true },
  ).exec()
  if (!updated) throw new ActiveCampaignExecutionOwnershipError('clareza-refresh')
}

async function settleReceipt(
  options: ClarezaRefreshExecutionOptions<unknown>,
  ownerId: string,
  status: 'completed' | 'failed' | 'indeterminate',
  providerStatus: ClarezaRefreshProviderStatus,
  result?: unknown,
): Promise<void> {
  const updated = await ClarezaRefreshExecutionReceipt.findOneAndUpdate(
    {
      operation: options.operation,
      identity: options.identity,
      fingerprint: options.fingerprint,
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
  ).exec()
  if (!updated) throw new ActiveCampaignExecutionOwnershipError('clareza-refresh')
}

export async function executeClarezaRefreshReceipt<T>(
  options: ClarezaRefreshExecutionOptions<T>,
): Promise<ClarezaRefreshExecutionOutcome<T>> {
  const leaseMs = options.leaseMs ?? CLAREZA_REFRESH_EXECUTION_LEASE_MS
  const now = options.now ?? (() => new Date())
  const claimed = await claimReceipt(options, now(), leaseMs)
  if (claimed.kind !== 'claimed') return claimed

  let providerAttempted = false
  let providerSucceeded = false
  let localMutationStarted = false
  let retryableProviderFailure = false
  const provider = {
    begin(): void { providerAttempted = true },
    notAttempted(): void { providerAttempted = false },
    success(): void { providerSucceeded = true },
    retryableFailure(): void { retryableProviderFailure = true },
  }
  const localMutation = {
    begin(): void { localMutationStarted = true },
  }
  const lease = startActiveCampaignExecutionLease('clareza-refresh', claimed.ownerId, {
    intervalMs: options.heartbeatMs ?? Math.min(10_000, Math.max(1_000, Math.floor(leaseMs / 3))),
    now,
    renew: (at) => renewReceipt(options as ClarezaRefreshExecutionOptions<unknown>, claimed.ownerId, leaseMs, at),
  })

  try {
    let result: T
    try {
      result = await lease.run(() => options.run({ lease, provider, localMutation }))
    } catch (error: unknown) {
      const ownershipLost = error instanceof ActiveCampaignExecutionOwnershipError
      const providerStatus: ClarezaRefreshProviderStatus = !providerAttempted
        ? 'not-started'
        : providerSucceeded ? 'succeeded' : 'unknown'
      const status = ownershipLost || localMutationStarted
        ? 'indeterminate'
        : 'failed'
      try {
        await settleReceipt(
          options as ClarezaRefreshExecutionOptions<unknown>,
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
          options as ClarezaRefreshExecutionOptions<unknown>,
          claimed.ownerId,
          'indeterminate',
          'unknown',
        )
      } catch {
        // Keep the execution fenced if Mongo cannot persist the terminal state.
      }
      return { kind: 'indeterminate' }
    }

    try {
      await settleReceipt(
        options as ClarezaRefreshExecutionOptions<unknown>,
        claimed.ownerId,
        retryableProviderFailure ? 'failed' : 'completed',
        providerSucceeded ? 'succeeded' : 'not-started',
        retryableProviderFailure ? undefined : result,
      )
    } catch {
      try {
        await settleReceipt(
          options as ClarezaRefreshExecutionOptions<unknown>,
          claimed.ownerId,
          'indeterminate',
          providerSucceeded ? 'succeeded' : 'unknown',
        )
      } catch {
        // The running lease remains fenced if Mongo is unavailable.
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

export async function runClarezaRefreshWithReceipt<T>(options: {
  operation: ClarezaRefreshExecutionOperation
  identity: string
  fingerprint: string
  requestId: string
  refresh: (hooks: ClarezaRefreshPhaseHooks) => Promise<T>
  now?: () => Date
}): Promise<T> {
  const execution = await executeClarezaRefreshReceipt({
    operation: options.operation,
    identity: options.identity,
    fingerprint: options.fingerprint,
    requestId: options.requestId,
    now: options.now,
    run: async (context) => {
      const providerConfigured = Boolean(getOptionalFmpApiKey())
      const hooks: ClarezaRefreshPhaseHooks = {
        assertOwnership: () => context.lease.assertOwnership(),
        providerStarted: () => {
          if (providerConfigured) context.provider.begin()
        },
        providerSucceeded: () => {
          if (providerConfigured) context.provider.success()
        },
        localMutationStarted: () => context.localMutation.begin(),
      }
      const result = await options.refresh(hooks)
      return result
    },
  })

  if (execution.kind === 'completed' || execution.kind === 'replay' || execution.kind === 'failed') {
    return execution.result
  }
  if (execution.kind === 'in-progress') {
    throw new HttpError({
      status: 409,
      code: 'CLAREZA_REFRESH_IN_PROGRESS',
      publicMessage: 'Refresh Clareza já está em processamento',
    })
  }
  if (execution.kind === 'request-id-reused') {
    throw new HttpError({
      status: 409,
      code: 'CLAREZA_REFRESH_REQUEST_ID_REUSED',
      publicMessage: 'X-Request-ID já foi usado noutro refresh Clareza',
    })
  }
  throw new HttpError({
    status: 503,
    code: 'CLAREZA_REFRESH_INDETERMINATE',
    publicMessage: 'Resultado do refresh Clareza ficou indeterminado; requer reconciliação',
  })
}
