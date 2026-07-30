import { normalizePlatformEngagement } from '../../../src/services/syncUtilizadoresServices/engagement/platformEngagementNormalizer'

describe('normalizePlatformEngagement', () => {
  it.each([
    ['hotmart', { engagementScore: 80 }, 80],
    ['hotmart', { engagementScore: 140 }, 100],
    ['hotmart', { engagementScore: -4 }, 0],
    ['curseduca', { engagementScore: 61 }, 61],
    ['curseduca', { alternativeEngagement: 47 }, 47],
    ['curseduca', { activityLevel: 'HIGH' }, 75],
    ['curseduca', { activityLevel: 'medium' }, 45],
    ['curseduca', { activityLevel: 'LOW' }, 15],
    ['discord', { engagementScore: 0 }, 0],
    ['discord', { engagementScore: 10 }, 15],
    ['discord', { engagementScore: 50 }, 35],
    ['discord', { engagementScore: 100 }, 60],
    ['discord', { engagementScore: 150 }, 80],
    ['discord', { engagementScore: 200 }, 100],
    ['future-platform', { engagementScore: 90 }, 0],
  ] as const)('%s normalizes %#', (platform, engagement, expected) => {
    expect(normalizePlatformEngagement(platform, engagement)).toBe(expected)
  })

  it.each([
    ['hotmart', null],
    ['hotmart', []],
    ['hotmart', '80'],
    ['hotmart', {}],
    ['hotmart', { engagementScore: Number.NaN }],
    ['hotmart', { engagementScore: Number.POSITIVE_INFINITY }],
    ['hotmart', { engagementScore: Number.NEGATIVE_INFINITY }],
    ['curseduca', null],
    ['curseduca', []],
    ['curseduca', 'medium'],
    ['curseduca', {}],
    ['curseduca', { engagementScore: Number.NaN }],
    ['curseduca', { alternativeEngagement: Number.POSITIVE_INFINITY }],
    ['curseduca', { engagementScore: Number.NEGATIVE_INFINITY }],
    ['discord', null],
    ['discord', []],
    ['discord', '50'],
    ['discord', {}],
    ['discord', { engagementScore: Number.NaN }],
    ['discord', { engagementScore: Number.POSITIVE_INFINITY }],
    ['discord', { engagementScore: Number.NEGATIVE_INFINITY }],
  ] as const)('%s returns zero for malformed engagement %#', (platform, engagement) => {
    expect(normalizePlatformEngagement(platform, engagement)).toBe(0)
  })
})
