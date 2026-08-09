import type { CurseducaIdentityLookup } from './curseducaIdentityLookup.client'
import type { GuruActiveSubscriptionLookup } from './guruActiveSubscription.client'

export interface DiscrepancyEnrollment {
  id: unknown
  status: string
}

export interface DiscrepancyCandidate {
  userId: unknown
  email: string
  name?: string
  guruStatus?: string
  curseducaUserId?: string
  curseducaSituation?: string
  joinedDate?: Date
  enrollment?: DiscrepancyEnrollment
}

export interface PendingEnrollmentInput {
  userId: unknown
  productId: unknown
  memberId: string
  enrolledAt: Date
  at: Date
  reason: string
}

export interface GuruDiscrepancyRepository {
  listCandidates(emails?: string[]): Promise<DiscrepancyCandidate[]>
  findActiveCurseducaProductId(): Promise<unknown | undefined>
  saveCurseducaUserId(userId: unknown, memberId: string): Promise<void>
  createPendingEnrollment(input: PendingEnrollmentInput): Promise<unknown>
  markPending(enrollmentId: unknown, at: Date, reason: string): Promise<void>
}

export type DiscrepancyAction =
  | 'created'
  | 'marked'
  | 're-marked (was INACTIVE but CursEduca still ACTIVE)'

export interface MarkedDiscrepancyDetail {
  email: string
  name?: string
  guruStatus?: string
  userProductId: unknown
  action: DiscrepancyAction
}

export interface MarkDiscrepanciesResult {
  marked: number
  created: number
  alreadyMarked: number
  skipped: number
  noUserProduct: number
  details: MarkedDiscrepancyDetail[]
}

export class CurseducaProductUnavailableError extends Error {
  constructor() {
    super('Produto CursEduca não encontrado')
    this.name = 'CurseducaProductUnavailableError'
  }
}

const emptyResult = (): MarkDiscrepanciesResult => ({
  marked: 0,
  created: 0,
  alreadyMarked: 0,
  skipped: 0,
  noUserProduct: 0,
  details: [],
})

const reasonFor = (candidate: DiscrepancyCandidate): string =>
  `Discrepância: Guru ${candidate.guruStatus}, Clareza ACTIVE`

export const createGuruDiscrepancyService = (
  repository: GuruDiscrepancyRepository,
  identityLookup: CurseducaIdentityLookup,
  subscriptionLookup: GuruActiveSubscriptionLookup,
  now: () => Date = () => new Date(),
) => ({
  async mark(emails?: string[]): Promise<MarkDiscrepanciesResult> {
    const normalizedEmails = emails?.map(email => email.toLowerCase().trim())
    const candidates = await repository.listCandidates(normalizedEmails)
    const result = emptyResult()
    if (candidates.length === 0) return result

    const productId = await repository.findActiveCurseducaProductId()
    if (productId === undefined) throw new CurseducaProductUnavailableError()

    for (const candidate of candidates) {
      const enrollment = candidate.enrollment
      let memberId = candidate.curseducaUserId
      if (!enrollment && !memberId) {
        const identity = await identityLookup.findByEmail(candidate.email)
        if (identity) {
          memberId = identity.curseducaUserId
          await repository.saveCurseducaUserId(candidate.userId, memberId)
        }
      }

      if (!enrollment && memberId) {
        const at = now()
        const id = await repository.createPendingEnrollment({
          userId: candidate.userId,
          productId,
          memberId,
          enrolledAt: candidate.joinedDate ?? at,
          at,
          reason: reasonFor(candidate),
        })
        result.created += 1
        result.details.push({
          email: candidate.email,
          name: candidate.name,
          guruStatus: candidate.guruStatus,
          userProductId: id,
          action: 'created',
        })
        continue
      }

      if (!enrollment) {
        result.noUserProduct += 1
        result.skipped += 1
        continue
      }
      if (enrollment.status === 'PARA_INATIVAR') {
        result.alreadyMarked += 1
        continue
      }
      if (enrollment.status === 'INACTIVE') {
        if (candidate.curseducaSituation !== 'ACTIVE') {
          result.skipped += 1
          continue
        }
        await repository.markPending(
          enrollment.id,
          now(),
          `Re-detetado: Guru ${candidate.guruStatus}, CursEduca situation ainda ACTIVE`,
        )
        result.marked += 1
        result.details.push({
          email: candidate.email,
          name: candidate.name,
          guruStatus: candidate.guruStatus,
          userProductId: enrollment.id,
          action: 're-marked (was INACTIVE but CursEduca still ACTIVE)',
        })
        continue
      }

      try {
        if (await subscriptionLookup.hasActiveSubscription(candidate.email)) {
          result.skipped += 1
          continue
        }
      } catch {
        // Preserve the fail-open review behavior: a Guru read outage must not
        // hide a discrepancy already evidenced by the local canceled status.
      }

      await repository.markPending(enrollment.id, now(), reasonFor(candidate))
      result.marked += 1
      result.details.push({
        email: candidate.email,
        name: candidate.name,
        guruStatus: candidate.guruStatus,
        userProductId: enrollment.id,
        action: 'marked',
      })
    }
    return result
  },
})

export type GuruDiscrepancyService = ReturnType<typeof createGuruDiscrepancyService>