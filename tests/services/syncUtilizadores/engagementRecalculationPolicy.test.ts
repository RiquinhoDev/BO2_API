import {
  buildEngagementUpdate,
  needsEngagementRecalculation,
} from '../../../src/services/syncUtilizadoresServices/engagement/engagement-recalculation-policy'

const now = new Date('2026-08-10T12:00:00.000Z')

describe('engagement recalculation policy', () => {
  it('skips a Hotmart enrollment whose date-derived metrics are current', () => {
    expect(needsEngagementRecalculation({
      userProduct: {
        engagement: {
          daysSinceLastLogin: 2,
          daysSinceLastAction: null,
          daysSinceEnrollment: 9,
          enrolledAt: new Date('2026-08-01T12:00:00.000Z'),
        },
      },
      user: { hotmart: { lastAccessDate: new Date('2026-08-08T12:00:00.000Z') } },
      product: { platform: 'hotmart' },
      now,
    })).toBe(false)
  })

  it('recalculates when a CursEduca action has crossed a day boundary', () => {
    expect(needsEngagementRecalculation({
      userProduct: {
        engagement: {
          daysSinceLastLogin: 1,
          daysSinceLastAction: 1,
          daysSinceEnrollment: null,
          enrolledAt: null,
        },
      },
      user: {
        curseduca: {
          lastLogin: new Date('2026-08-09T12:00:00.000Z'),
          lastAction: new Date('2026-08-08T12:00:00.000Z'),
        },
      },
      product: { platform: 'curseduca' },
      now,
    })).toBe(true)
  })

  it('builds only the non-null metrics that changed', () => {
    const enrolledAt = new Date('2026-08-01T12:00:00.000Z')

    expect(buildEngagementUpdate({
      current: {
        daysSinceLastLogin: 2,
        daysSinceLastAction: 3,
        daysSinceEnrollment: 8,
        enrolledAt,
        actionsLastWeek: 4,
      },
      calculated: {
        daysSinceLastLogin: 2,
        daysSinceLastAction: null,
        daysSinceEnrollment: 9,
        enrolledAt: new Date(enrolledAt),
        actionsLastWeek: 5,
      },
    })).toEqual({
      'engagement.daysSinceEnrollment': 9,
      'engagement.actionsLastWeek': 5,
    })
  })
})
