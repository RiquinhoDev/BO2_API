import {
  createGuruDiscrepancyService,
  type DiscrepancyCandidate,
  type GuruDiscrepancyRepository,
} from '../../src/services/guru/guruDiscrepancy.service'
import type { CurseducaIdentityLookup } from '../../src/services/guru/curseducaIdentityLookup.client'
import type { GuruActiveSubscriptionLookup } from '../../src/services/guru/guruActiveSubscription.client'

describe.each([1, 10, 100])('Guru discrepancy compensation N=%i', (size) => {
  test('keeps fallback identity and dependent writes sequential with complete accounting', async () => {
    const candidates: DiscrepancyCandidate[] = Array.from({ length: size }, (_, index) => ({
      userId: `user-${index}`,
      email: `user-${index}@example.test`,
      guruStatus: 'canceled',
    }))
    let active = 0
    let peak = 0
    const events: string[] = []
    const enter = async (event: string) => {
      active++
      peak = Math.max(peak, active)
      events.push(event)
      await Promise.resolve()
      active--
    }
    const repository: GuruDiscrepancyRepository = {
      listCandidates: jest.fn(async () => candidates),
      findActiveCurseducaProductId: jest.fn(async () => 'product'),
      saveCurseducaUserId: jest.fn(async (userId) => enter(`save:${userId}`)),
      createPendingEnrollment: jest.fn(async ({ userId }) => {
        await enter(`create:${userId}`)
        return `enrollment-${userId}`
      }),
      markPending: jest.fn(async () => undefined),
    }
    const identity: CurseducaIdentityLookup = {
      findByEmail: jest.fn(async (email) => {
        await enter(`identity:${email}`)
        return {
          curseducaUserId: `member-${email}`,
          situation: 'ACTIVE',
          name: email,
        }
      }),
    }
    const subscriptions: GuruActiveSubscriptionLookup = {
      hasActiveSubscription: jest.fn(async () => false),
    }

    const result = await createGuruDiscrepancyService(
      repository,
      identity,
      subscriptions,
      () => new Date('2026-08-12T12:00:00.000Z'),
    ).mark()

    expect(peak).toBe(1)
    expect(events).toEqual(candidates.flatMap(candidate => [
      `identity:${candidate.email}`,
      `save:${candidate.userId}`,
      `create:${candidate.userId}`,
    ]))
    expect(result.created).toBe(size)
    expect(result.details.map(detail => detail.email)).toEqual(candidates.map(candidate => candidate.email))
  })
})

describe.each([1, 10, 100])('Guru discrepancy partial failures N=%i', (size) => {
  test('stops at the first dependent failure instead of claiming complete compensation', async () => {
    const candidates: DiscrepancyCandidate[] = Array.from({ length: size }, (_, index) => ({
      userId: `user-${index}`,
      email: `user-${index}@example.test`,
      guruStatus: 'canceled',
    }))
    const repository: GuruDiscrepancyRepository = {
      listCandidates: jest.fn(async () => candidates),
      findActiveCurseducaProductId: jest.fn(async () => 'product'),
      saveCurseducaUserId: jest.fn(async () => { throw new Error('identity-save') }),
      createPendingEnrollment: jest.fn(async () => 'never'),
      markPending: jest.fn(async () => undefined),
    }
    const identity: CurseducaIdentityLookup = {
      findByEmail: jest.fn(async (email) => ({
        curseducaUserId: `member-${email}`,
        situation: 'ACTIVE',
        name: email,
      })),
    }

    await expect(createGuruDiscrepancyService(
      repository,
      identity,
      { hasActiveSubscription: jest.fn(async () => false) },
    ).mark()).rejects.toThrow('identity-save')
    expect(repository.saveCurseducaUserId).toHaveBeenCalledTimes(1)
    expect(repository.createPendingEnrollment).not.toHaveBeenCalled()
  })
})
