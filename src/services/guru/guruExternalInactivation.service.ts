import {
  CURSEDUCA_INACTIVATION_PROVIDER_TIMEOUT_MS,
  type CurseducaInactivationClient,
} from './curseducaInactivation.client'
import { randomUUID } from 'node:crypto'
import { MAX_BULK_OPERATION_ITEMS } from '../../security/bulkOperationPolicy'

export const CURSEDUCA_INACTIVATION_LEASE_MS =
  CURSEDUCA_INACTIVATION_PROVIDER_TIMEOUT_MS * 6

export interface ExternalInactivationEnrollment {
  id: unknown
  userId: unknown
  email?: string
  memberId?: string | number
  hasCurseducaUser: boolean
  status?: string
}

export interface GuruExternalInactivationRepository {
  findOne(criteria: { userProductId?: string; curseducaUserId?: string }): Promise<ExternalInactivationEnrollment | undefined>
  findMany(criteria: { userProductIds?: string[]; all?: boolean }): Promise<ExternalInactivationEnrollment[]>
  markDuplicates(ids: unknown[], at: Date): Promise<void>
  claimInactivation(
    id: unknown,
    claimId: string,
    at: Date,
    leaseExpiresAt: Date,
  ): Promise<boolean>
  releaseInactivationClaim(id: unknown, claimId: string): Promise<void>
  markInactive(
    enrollment: ExternalInactivationEnrollment,
    at: Date,
    source: 'guru_integration' | 'guru_integration_bulk',
    response?: unknown,
    claimId?: string,
  ): Promise<void>
  recordFailure(id: unknown, at: Date, error: string, claimId?: string): Promise<void>
}

export interface GuruExternalInactivationOptions {
  now?: () => Date
  sleep?: (milliseconds: number) => Promise<void>
  enabled?: () => boolean
}

export class GuruExternalInactivationLimitError extends Error {
  readonly limit = MAX_BULK_OPERATION_ITEMS

  constructor() {
    super(`Inativação CursEduca limitada a ${MAX_BULK_OPERATION_ITEMS} registos por execução`)
    this.name = 'GuruExternalInactivationLimitError'
  }
}

export type SingleInactivationResult =
  | { kind: 'not-found' }
  | { kind: 'missing-member' }
  | { kind: 'in-progress' }
  | { kind: 'remote-failure'; error: string }
  | { kind: 'disabled' }
  | { kind: 'dry-run'; memberId: string | number; email?: string; planned: boolean; alreadyInactive?: boolean }
  | { kind: 'success'; memberId: string | number; email?: string; alreadyInactive?: boolean }

export interface BulkInactivationDetail {
  userProductId: unknown
  email?: string
  memberId?: string | number
  success: boolean
  error?: string
  inProgress?: boolean
  planned?: boolean
  alreadyInactive?: boolean
}

export interface BulkInactivationResult {
  processed: number
  succeeded: number
  failed: number
  details: BulkInactivationDetail[]
  disabled?: boolean
  dryRun?: boolean
  planned?: number
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

type InactivationExecutionResult =
  | { kind: 'in-progress' }
  | { kind: 'failure'; error: string }
  | { kind: 'success' }

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const createGuruExternalInactivationService = (
  repository: GuruExternalInactivationRepository,
  client: CurseducaInactivationClient,
  options: GuruExternalInactivationOptions = {},
) => {
  const now = options.now ?? (() => new Date())
  const sleep = options.sleep ?? defaultSleep
  const enabled = options.enabled ?? (() => false)

  const executeInactivation = async (
    enrollment: ExternalInactivationEnrollment,
    memberId: string | number,
    source: 'guru_integration' | 'guru_integration_bulk',
  ): Promise<InactivationExecutionResult> => {
    const claimId = randomUUID()
    const claimedAt = now()
    const claimed = await repository.claimInactivation(
      enrollment.id,
      claimId,
      claimedAt,
      new Date(claimedAt.getTime() + CURSEDUCA_INACTIVATION_LEASE_MS),
    )
    if (!claimed) return { kind: 'in-progress' }

    try {
      let remote: Awaited<ReturnType<CurseducaInactivationClient['inactivate']>>
      try {
        remote = await client.inactivate(memberId)
      } catch (error: unknown) {
        const message = errorMessage(error)
        await repository.recordFailure(enrollment.id, now(), message, claimId)
        return { kind: 'failure', error: message }
      }

      if (!remote.success) {
        await repository.recordFailure(enrollment.id, now(), remote.error, claimId)
        return { kind: 'failure', error: remote.error }
      }

      try {
        await repository.markInactive(
          enrollment,
          now(),
          source,
          source === 'guru_integration' ? remote.response : undefined,
          claimId,
        )
      } catch (error: unknown) {
        const message = errorMessage(error)
        await repository.recordFailure(enrollment.id, now(), message, claimId)
        return { kind: 'failure', error: message }
      }
      return { kind: 'success' }
    } finally {
      await repository.releaseInactivationClaim(enrollment.id, claimId)
    }
  }

  const inactivateSingle = async (criteria: {
    userProductId?: string
    curseducaUserId?: string
    dryRun?: boolean
  }): Promise<SingleInactivationResult> => {
    const dryRun = criteria.dryRun === true
    if (!dryRun && !enabled()) return { kind: 'disabled' }

    const enrollment = await repository.findOne(criteria)
    if (!enrollment) return { kind: 'not-found' }
    if (!enrollment.memberId) return { kind: 'missing-member' }
    if (dryRun) {
      return {
        kind: 'dry-run',
        memberId: enrollment.memberId,
        email: enrollment.email,
        planned: enrollment.status !== 'INACTIVE',
        ...(enrollment.status === 'INACTIVE' ? { alreadyInactive: true } : {}),
      }
    }
    if (enrollment.status === 'INACTIVE') {
      return {
        kind: 'success',
        memberId: enrollment.memberId,
        email: enrollment.email,
        alreadyInactive: true,
      }
    }

    const result = await executeInactivation(enrollment, enrollment.memberId, 'guru_integration')
    if (result.kind === 'in-progress') return result
    if (result.kind === 'failure') return { kind: 'remote-failure', error: result.error }
    return {
      kind: 'success',
      memberId: enrollment.memberId,
      email: enrollment.email,
    }
  }

  const inactivateBulk = async (criteria: {
    userProductIds?: string[]
    all?: boolean
    dryRun?: boolean
  }): Promise<BulkInactivationResult> => {
    const dryRun = criteria.dryRun === true
    if (!dryRun && !enabled()) {
      return { processed: 0, succeeded: 0, failed: 0, details: [], disabled: true }
    }

    if ((criteria.userProductIds?.length ?? 0) > MAX_BULK_OPERATION_ITEMS) {
      throw new GuruExternalInactivationLimitError()
    }
    const enrollments = await repository.findMany(criteria)
    if (criteria.all === true && enrollments.length > MAX_BULK_OPERATION_ITEMS) {
      throw new GuruExternalInactivationLimitError()
    }

    const unique: ExternalInactivationEnrollment[] = []
    const duplicateIds: unknown[] = []
    const seenMemberIds = new Set<string>()

    for (const enrollment of enrollments) {
      const key = enrollment.memberId === undefined ? undefined : String(enrollment.memberId)
      if (key === undefined || !seenMemberIds.has(key)) {
        if (key !== undefined) seenMemberIds.add(key)
        unique.push(enrollment)
      } else {
        duplicateIds.push(enrollment.id)
      }
    }
    if (!dryRun && duplicateIds.length > 0) await repository.markDuplicates(duplicateIds, now())

    const result: BulkInactivationResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      details: [],
      ...(dryRun ? { dryRun: true, planned: 0 } : {}),
    }
    for (const enrollment of unique) {
      result.processed += 1
      if (!enrollment.memberId) {
        result.failed += 1
        result.details.push({
          userProductId: enrollment.id,
          email: enrollment.email,
          success: false,
          error: 'curseducaUserId não encontrado',
        })
        continue
      }
      if (enrollment.status === 'INACTIVE') {
        if (!dryRun) result.succeeded += 1
        result.details.push({
          userProductId: enrollment.id,
          email: enrollment.email,
          memberId: enrollment.memberId,
          success: true,
          alreadyInactive: true,
        })
        continue
      }
      if (dryRun) {
        result.planned = (result.planned ?? 0) + 1
        result.details.push({
          userProductId: enrollment.id,
          email: enrollment.email,
          memberId: enrollment.memberId,
          success: true,
          planned: true,
        })
        continue
      }
      const execution = await executeInactivation(
        enrollment,
        enrollment.memberId,
        'guru_integration_bulk',
      )
      if (execution.kind === 'success') {
        result.succeeded += 1
        result.details.push({
          userProductId: enrollment.id,
          email: enrollment.email,
          memberId: enrollment.memberId,
          success: true,
        })
      } else {
        result.failed += 1
        result.details.push({
          userProductId: enrollment.id,
          email: enrollment.email,
          memberId: enrollment.memberId,
          success: false,
          ...(execution.kind === 'in-progress'
            ? { error: 'Inativação já em processamento', inProgress: true }
            : { error: execution.error }),
        })
      }
      await sleep(500)
    }
    return result
  }

  return { inactivateSingle, inactivateBulk }
}

export type GuruExternalInactivationService = ReturnType<typeof createGuruExternalInactivationService>
