import {
  engagementLevelFromScore,
  engagementRangeFor,
} from '../../../src/services/users/usersV2Enrollment.domain'

describe('users V2 enrollment engagement domain', () => {
  it.each([
    [-1, 'NONE'],
    [0, 'NONE'],
    [1, 'MUITO_BAIXO'],
    [19, 'MUITO_BAIXO'],
    [20, 'BAIXO'],
    [39, 'BAIXO'],
    [40, 'MEDIO'],
    [59, 'MEDIO'],
    [60, 'ALTO'],
    [79, 'ALTO'],
    [80, 'MUITO_ALTO'],
  ])('classifies score %s as %s', (score, level) => {
    expect(engagementLevelFromScore(score)).toBe(level)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'normalizes non-finite score %s to NONE',
    score => {
      expect(engagementLevelFromScore(score)).toBe('NONE')
    },
  )

  it('maps engagement levels to non-overlapping Mongo numeric ranges', () => {
    expect(engagementRangeFor([
      'NONE',
      'MUITO_BAIXO',
      'BAIXO',
      'MEDIO',
      'ALTO',
      'MUITO_ALTO',
    ])).toEqual([
      { maxInclusive: 0 },
      { minExclusive: 0, maxExclusive: 20 },
      { minInclusive: 20, maxExclusive: 40 },
      { minInclusive: 40, maxExclusive: 60 },
      { minInclusive: 60, maxExclusive: 80 },
      { minInclusive: 80 },
    ])
  })
})
