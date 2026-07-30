import type { EngagementLevel } from './usersV2Enrollment.contract'

export interface MongoNumericRange {
  minExclusive?: number
  minInclusive?: number
  maxExclusive?: number
  maxInclusive?: number
}

interface EngagementBand {
  level: EngagementLevel
  range: MongoNumericRange
  includes(score: number): boolean
}

const engagementBands: readonly EngagementBand[] = [
  {
    level: 'NONE',
    range: { maxInclusive: 0 },
    includes: score => score <= 0,
  },
  {
    level: 'MUITO_BAIXO',
    range: { minExclusive: 0, maxExclusive: 20 },
    includes: score => score > 0 && score < 20,
  },
  {
    level: 'BAIXO',
    range: { minInclusive: 20, maxExclusive: 40 },
    includes: score => score >= 20 && score < 40,
  },
  {
    level: 'MEDIO',
    range: { minInclusive: 40, maxExclusive: 60 },
    includes: score => score >= 40 && score < 60,
  },
  {
    level: 'ALTO',
    range: { minInclusive: 60, maxExclusive: 80 },
    includes: score => score >= 60 && score < 80,
  },
  {
    level: 'MUITO_ALTO',
    range: { minInclusive: 80 },
    includes: score => score >= 80,
  },
]

export function engagementLevelFromScore(score: number): EngagementLevel {
  if (!Number.isFinite(score)) return 'NONE'

  for (const band of engagementBands) {
    if (band.includes(score)) return band.level
  }

  return 'NONE'
}

export function engagementRangeFor(
  levels: EngagementLevel[],
): MongoNumericRange[] {
  const ranges: MongoNumericRange[] = []

  for (const level of levels) {
    const band = engagementBands.find(candidate => candidate.level === level)
    if (band) ranges.push({ ...band.range })
  }

  return ranges
}
