import type { CurseducaInactivationClient } from './curseducaInactivation.client'

export interface ExternalInactivationEnrollment {
  id: unknown
  userId: unknown
  email?: string
  memberId?: string | number
  hasCurseducaUser: boolean
}

export interface GuruExternalInactivationRepository {
  findOne(criteria: { userProductId?: string; curseducaUserId?: string }): Promise<ExternalInactivationEnrollment | undefined>
  findMany(criteria: { userProductIds?: string[]; all?: boolean }): Promise<ExternalInactivationEnrollment[]>
  markDuplicates(ids: unknown[], at: Date): Promise<void>
  markInactive(
    enrollment: ExternalInactivationEnrollment,
    at: Date,
    source: 'guru_integration' | 'guru_integration_bulk',
    response?: unknown,
  ): Promise<void>
  recordFailure(id: unknown, at: Date, error: string): Promise<void>
}

export interface GuruExternalInactivationOptions {
  now?: () => Date
  sleep?: (milliseconds: number) => Promise<void>
}

export type SingleInactivationResult =
  | { kind: 'not-found' }
  | { kind: 'missing-member' }
  | { kind: 'remote-failure'; error: string }
  | { kind: 'success'; memberId: string | number; email?: string }

export interface BulkInactivationDetail {
  userProductId: unknown
  email?: string
  memberId?: string | number
  success: boolean
  error?: string
}

export interface BulkInactivationResult {
  processed: number
  succeeded: number
  failed: number
  details: BulkInactivationDetail[]
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

export const createGuruExternalInactivationService = (
  repository: GuruExternalInactivationRepository,
  client: CurseducaInactivationClient,
  options: GuruExternalInactivationOptions = {},
) => {
  const now = options.now ?? (() => new Date())
  const sleep = options.sleep ?? defaultSleep

  const inactivateSingle = async (criteria: {
    userProductId?: string
    curseducaUserId?: string
  }): Promise<SingleInactivationResult> => {
    const enrollment = await repository.findOne(criteria)
    if (!enrollment) return { kind: 'not-found' }
    if (!enrollment.memberId) return { kind: 'missing-member' }

    const result = await client.inactivate(enrollment.memberId)
    if (!result.success) {
      await repository.recordFailure(enrollment.id, now(), result.error)
      return { kind: 'remote-failure', error: result.error }
    }
    await repository.markInactive(
      enrollment,
      now(),
      'guru_integration',
      result.response,
    )
    return {
      kind: 'success',
      memberId: enrollment.memberId,
      email: enrollment.email,
    }
  }

  const inactivateBulk = async (criteria: {
    userProductIds?: string[]
    all?: boolean
  }): Promise<BulkInactivationResult> => {
    const enrollments = await repository.findMany(criteria)
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
    if (duplicateIds.length > 0) await repository.markDuplicates(duplicateIds, now())

    const result: BulkInactivationResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      details: [],
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
      try {
        const remote = await client.inactivate(enrollment.memberId)
        if (remote.success) {
          await repository.markInactive(enrollment, now(), 'guru_integration_bulk')
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
            error: remote.error,
          })
        }
        await sleep(500)
      } catch (error: unknown) {
        result.failed += 1
        result.details.push({
          userProductId: enrollment.id,
          email: enrollment.email,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return result
  }

  return { inactivateSingle, inactivateBulk }
}

export type GuruExternalInactivationService = ReturnType<typeof createGuruExternalInactivationService>