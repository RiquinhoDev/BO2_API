import type { IUser } from '../../../src/models/user'
import {
  EXPIRATION_DAYS,
  HotmartExpirationPolicy,
  formatDateOnly,
  getActiveHotmartClassForExpiration,
} from '../../../src/services/syncUtilizadoresServices/universalSync/hotmartExpiration'

const NOW = new Date('2026-06-15T00:00:00.000Z')
const policy = new HotmartExpirationPolicy({ now: () => NOW })
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

type UserPick = Pick<IUser, 'hotmart'>
type Enrollment = NonNullable<NonNullable<IUser['hotmart']>['enrolledClasses']>
const enrollments = (rows: Array<{ classId?: string; className?: string; isActive?: boolean }>): Enrollment =>
  rows as unknown as Enrollment

describe('formatDateOnly', () => {
  it('renders the ISO date only', () => {
    expect(formatDateOnly(new Date('2026-01-02T09:10:11.000Z'))).toBe('2026-01-02')
  })
})

describe('HotmartExpirationPolicy.daysSincePurchase', () => {
  it('floors elapsed days from the injected clock, 0 for no date', () => {
    expect(policy.daysSincePurchase(null)).toBe(0)
    expect(policy.daysSincePurchase(daysAgo(400))).toBe(400)
  })
})

describe('HotmartExpirationPolicy.evaluate — purchaseDate branch', () => {
  it('cannot evaluate without a purchase date or class period', () => {
    const e = policy.evaluate(null)
    expect(e.canEvaluate).toBe(false)
    expect(e.isExpired).toBe(false)
    expect(e.expirationSource).toBe('purchaseDate')
  })

  it('expires past the day limit and not before', () => {
    const expired = policy.evaluate(daysAgo(EXPIRATION_DAYS + 20))
    expect(expired).toMatchObject({ canEvaluate: true, isExpired: true, expirationSource: 'purchaseDate' })

    const fresh = policy.evaluate(daysAgo(100))
    expect(fresh).toMatchObject({ canEvaluate: true, isExpired: false })
  })
})

describe('HotmartExpirationPolicy.evaluate — turma period branch', () => {
  it('uses the class expiry when the name carries a past period', () => {
    const e = policy.evaluate(daysAgo(10), 'Turma 2301') // Jan 2023 + 1yr -> long past 2026
    expect(e.canEvaluate).toBe(true)
    expect(e.isExpired).toBe(true)
    expect(e.expirationSource).toBe('turma')
    expect(e.accessEndOgi).toBeInstanceOf(Date)
  })

  it('is not expired for a future class period', () => {
    const e = policy.evaluate(daysAgo(10), 'Turma 3512') // Dec 2035 + 1yr -> future
    expect(e.canEvaluate).toBe(true)
    expect(e.isExpired).toBe(false)
    expect(e.expirationSource).toBe('turma')
  })
})

describe('getActiveHotmartClassForExpiration', () => {
  const user = (rows: Array<{ classId?: string; className?: string; isActive?: boolean }>): UserPick =>
    ({ hotmart: { enrolledClasses: enrollments(rows) } } as unknown as UserPick)

  it('prefers an active named class over an inactive one', () => {
    const result = getActiveHotmartClassForExpiration(
      user([{ classId: 'x', className: 'Inactive', isActive: false }, { classId: 'y', className: 'Active', isActive: true }]),
    )
    expect(result).toEqual({ classId: 'y', className: 'Active' })
  })

  it('falls back to any named class, then to the fallback name, then null', () => {
    const anyNamed = getActiveHotmartClassForExpiration(user([{ classId: 'z', className: 'OnlyOne', isActive: false }]))
    expect(anyNamed).toEqual({ classId: 'z', className: 'OnlyOne' })

    const fallback = getActiveHotmartClassForExpiration(user([]), undefined, 'fid', 'Fallback')
    expect(fallback).toEqual({ classId: 'fid', className: 'Fallback' })

    expect(getActiveHotmartClassForExpiration(user([]))).toBeNull()
  })
})
