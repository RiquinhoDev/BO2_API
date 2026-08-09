import { calculateDecisionMetrics } from '../../../src/services/activeCampaign/decisionMetrics'

const NOW = new Date('2026-08-09T12:00:00.000Z')

describe('calculateDecisionMetrics', () => {
  it('prefers stored engagement values and preserves the legacy totalActions zero', () => {
    const metrics = calculateDecisionMetrics(
      {
        engagement: {
          daysSinceLastLogin: 2,
          daysSinceLastAction: 3,
          daysSinceEnrollment: 40,
          engagementScore: 81,
          totalLogins: 9
        }
      },
      { now: NOW, getLastActivity: () => new Date('2026-08-08T12:00:00.000Z') }
    )

    expect(metrics).toEqual({
      daysSinceLastLogin: 2,
      daysSinceLastAction: 3,
      daysSinceEnrollment: 40,
      engagementScore: 81,
      totalLogins: 9,
      totalActions: 0
    })
  })

  it('derives fallback inactivity from the injected clock', () => {
    const metrics = calculateDecisionMetrics(
      {},
      { now: NOW, getLastActivity: () => new Date('2026-08-06T11:59:59.000Z') }
    )

    expect(metrics.daysSinceLastLogin).toBe(3)
    expect(metrics.daysSinceLastAction).toBe(3)
    expect(metrics.daysSinceEnrollment).toBe(999)
  })

  it('keeps unknown learner activity null instead of using account age', () => {
    const metrics = calculateDecisionMetrics({}, { now: NOW, getLastActivity: () => null })

    expect(metrics.daysSinceLastLogin).toBeNull()
    expect(metrics.daysSinceLastAction).toBeNull()
  })

  it('clamps future activity to zero days', () => {
    const metrics = calculateDecisionMetrics(
      {},
      { now: NOW, getLastActivity: () => new Date('2026-08-10T12:00:00.000Z') }
    )

    expect(metrics.daysSinceLastLogin).toBe(0)
  })
})
