import {
  calculateSnapshotEngagementScore,
  normalizeSnapshotMonth
} from '../../../src/services/syncUtilizadoresServices/activitySnapshot/metrics'

describe('activity snapshot metrics', () => {
  it('normalizes a date to the first local instant of its month', () => {
    expect(normalizeSnapshotMonth(new Date(2026, 7, 19, 14, 30))).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0))
  })

  it('preserves weighted engagement and caps it at one hundred', () => {
    expect(calculateSnapshotEngagementScore({ hadLogin: true, hadActivity: true, loginCount: 3, activityCount: 4 })).toBe(68)
    expect(calculateSnapshotEngagementScore({ hadLogin: true, hadActivity: true, loginCount: 100, activityCount: 100 })).toBe(100)
  })
})
