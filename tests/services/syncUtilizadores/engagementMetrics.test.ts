import type { IUser } from '../../../src/models/user'
import type { IProduct } from '../../../src/models/product/Product'
import { calculateEngagementMetrics } from '../../../src/services/syncUtilizadoresServices/universalSync/engagement/engagementMetrics'

const NOW = new Date('2026-06-15T00:00:00.000Z')
const clock = { now: () => NOW }
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

const product = (platform: string): IProduct => ({ code: 'P', platform } as unknown as IProduct)
const user = (shape: Record<string, unknown>): IUser => shape as unknown as IUser

describe('calculateEngagementMetrics — hotmart', () => {
  it('derives login recency, totalLogins, and the tag-v2 heuristics', () => {
    const m = calculateEngagementMetrics(
      user({ hotmart: { lastAccessDate: daysAgo(10), engagement: { accessCount: 5 }, purchaseDate: daysAgo(200) } }),
      product('hotmart'),
      clock,
    )
    expect(m.engagement.daysSinceLastLogin).toBe(10)
    expect(m.engagement.totalLogins).toBe(5)
    expect(m.engagement.daysInactive).toBe(10)
    expect(m.engagement.loginsLast30Days).toBe(6) // max(1, floor((30-10)/3))
    expect(m.engagement.weeksActiveLast30Days).toBe(3) // 10 < 14
    expect(m.metadata.platform).toBe('hotmart')
    expect(m.metadata.purchaseDate).toEqual(daysAgo(200))
  })

  it('falls back to firstAccessDate and accepts a string date', () => {
    const m = calculateEngagementMetrics(
      user({ hotmart: { firstAccessDate: daysAgo(3).toISOString() } }),
      product('hotmart'),
      clock,
    )
    expect(m.engagement.daysSinceLastLogin).toBe(3)
    expect(m.engagement.totalLogins).toBe(0)
  })

  it('returns nulls/zeros when no signals are present', () => {
    const m = calculateEngagementMetrics(user({ hotmart: {} }), product('hotmart'), clock)
    expect(m.engagement.daysSinceLastLogin).toBeNull()
    expect(m.engagement.totalLogins).toBe(0)
    expect(m.engagement.daysInactive).toBeUndefined()
    expect(m.engagement.loginsLast30Days).toBe(0) // inactive-or-unknown branch
    expect(m.engagement.weeksActiveLast30Days).toBeUndefined()
  })
})

describe('calculateEngagementMetrics — curseduca', () => {
  it('derives action recency, enrollment age, and joinedDate purchase', () => {
    const m = calculateEngagementMetrics(
      user({ curseduca: { lastAccess: daysAgo(5), joinedDate: daysAgo(40), enrolledClasses: [{ enteredAt: daysAgo(50) }] } }),
      product('curseduca'),
      clock,
    )
    expect(m.engagement.daysSinceLastAction).toBe(5)
    expect(m.engagement.daysSinceEnrollment).toBe(50) // enrolledClasses[0].enteredAt wins
    expect(m.engagement.daysInactive).toBe(5)
    expect(m.engagement.loginsLast30Days).toBe(5) // max(1, floor((30-5)/5))
    expect(m.engagement.weeksActiveLast30Days).toBe(4) // 5 < 7
    expect(m.metadata.purchaseDate).toEqual(daysAgo(40))
  })
})

describe('calculateEngagementMetrics — discord', () => {
  it('produces no engagement recency and uses discord.createdAt for purchase', () => {
    const m = calculateEngagementMetrics(
      user({ discord: { createdAt: daysAgo(2) } }),
      product('discord'),
      clock,
    )
    expect(m.engagement.daysSinceLastLogin).toBeNull()
    expect(m.engagement.daysSinceLastAction).toBeNull()
    expect(m.engagement.totalLogins).toBe(0)
    expect(m.engagement.daysInactive).toBeUndefined()
    expect(m.engagement.loginsLast30Days).toBeUndefined()
    expect(m.metadata.purchaseDate).toEqual(daysAgo(2))
  })
})

describe('calculateEngagementMetrics — clock is injected', () => {
  it('recomputes day deltas against the provided instant', () => {
    const later = { now: () => new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000) }
    const m = calculateEngagementMetrics(
      user({ hotmart: { lastAccessDate: daysAgo(10) } }),
      product('hotmart'),
      later,
    )
    expect(m.engagement.daysSinceLastLogin).toBe(15) // 10 + 5
  })
})
