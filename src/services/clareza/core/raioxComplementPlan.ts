export type ComplementPeriod = 'latest' | 'annual' | 'quarter' | 'event' | 'price-history'

export interface RaioxComplementRequirement {
  readonly name: string
  readonly path: string
  readonly period: ComplementPeriod
  readonly minRecords?: number
  readonly minYears?: number
  readonly requiredFields?: readonly string[]
}

export interface CoreDatasetAvailability {
  readonly name: string
  readonly period: ComplementPeriod
  readonly records?: number
  readonly years?: number
  readonly fields?: readonly string[]
}

export interface RaioxComplementDecision extends RaioxComplementRequirement {
  readonly action: 'reuse-core' | 'fetch-complement'
  readonly reason: 'coverage-satisfied' | 'coverage-insufficient' | 'missing'
}

export const RAIOX_COMPLEMENT_REQUIREMENTS: readonly RaioxComplementRequirement[] = [
  { name: 'profile-extra', path: '/profile', period: 'latest',
    requiredFields: ['ceo', 'fullTimeEmployees', 'country', 'industry'] },
  { name: 'analyst-estimates', path: '/analyst-estimates', period: 'annual', minRecords: 10 },
  { name: 'annual-income', path: '/income-statement', period: 'annual', minRecords: 8 },
  { name: 'annual-cash-flow', path: '/cash-flow-statement', period: 'annual', minRecords: 8 },
  { name: 'quarterly-income', path: '/income-statement', period: 'quarter', minRecords: 8 },
  { name: 'quarterly-cash-flow', path: '/cash-flow-statement', period: 'quarter', minRecords: 8 },
  { name: 'annual-ratios', path: '/ratios', period: 'annual', minRecords: 8 },
  { name: 'grades-consensus', path: '/grades-consensus', period: 'latest' },
  { name: 'price-target-consensus', path: '/price-target-consensus', period: 'latest' },
  { name: 'earnings', path: '/earnings', period: 'event', minRecords: 8 },
  { name: 'dividends', path: '/dividends', period: 'event', minRecords: 60 },
  { name: 'peer-ratios', path: '/stock-peers + /ratios-ttm', period: 'latest', minRecords: 3 },
  { name: 'price-history', path: '/historical-price-eod/light', period: 'price-history', minYears: 5 },
  { name: 'benchmark-price-history', path: '/historical-price-eod/light', period: 'price-history', minYears: 5 },
  { name: 'revenue-segmentation', path: '/revenue-product-segmentation', period: 'quarter', minRecords: 1 },
] as const

function satisfiesCoverage(
  available: CoreDatasetAvailability,
  requirement: RaioxComplementRequirement,
): boolean {
  if (available.period !== requirement.period) return false
  if (requirement.minRecords !== undefined
    && (!Number.isInteger(available.records) || (available.records ?? -1) < requirement.minRecords)) {
    return false
  }
  if (requirement.minYears !== undefined
    && (!Number.isFinite(available.years) || (available.years ?? -1) < requirement.minYears)) {
    return false
  }
  const fields = new Set(available.fields ?? [])
  return (requirement.requiredFields ?? []).every(field => fields.has(field))
}

export function planRaioxComplements(
  availability: readonly CoreDatasetAvailability[],
): readonly RaioxComplementDecision[] {
  const names = availability.map(dataset => dataset.name)
  if (new Set(names).size !== names.length) {
    throw new RangeError('core dataset availability contains duplicate names')
  }
  const byName = new Map(availability.map(dataset => [dataset.name, dataset]))
  return RAIOX_COMPLEMENT_REQUIREMENTS.map(requirement => {
    const available = byName.get(requirement.name)
    if (!available) return { ...requirement, action: 'fetch-complement', reason: 'missing' }
    if (!satisfiesCoverage(available, requirement)) {
      return { ...requirement, action: 'fetch-complement', reason: 'coverage-insufficient' }
    }
    return { ...requirement, action: 'reuse-core', reason: 'coverage-satisfied' }
  })
}
