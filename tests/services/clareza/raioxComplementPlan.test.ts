import {
  RAIOX_COMPLEMENT_REQUIREMENTS,
  planRaioxComplements,
} from '../../../src/services/clareza/core/raioxComplementPlan'

describe('Raio-X complement plan', () => {
  it('reuses only datasets whose period and coverage satisfy the companion contract', () => {
    const plan = planRaioxComplements([
      { name: 'annual-income', period: 'annual', records: 8 },
      { name: 'annual-cash-flow', period: 'annual', records: 6 },
      { name: 'quarterly-income', period: 'annual', records: 8 },
      { name: 'price-history', period: 'price-history', years: 5 },
      { name: 'grades-consensus', period: 'latest' },
    ])

    expect(plan.find(item => item.name === 'annual-income')).toMatchObject({ action: 'reuse-core' })
    expect(plan.find(item => item.name === 'annual-cash-flow')).toMatchObject({
      action: 'fetch-complement', reason: 'coverage-insufficient',
    })
    expect(plan.find(item => item.name === 'quarterly-income')).toMatchObject({
      action: 'fetch-complement', reason: 'coverage-insufficient',
    })
    expect(plan.find(item => item.name === 'price-history')).toMatchObject({ action: 'reuse-core' })
    expect(plan.find(item => item.name === 'dividends')).toMatchObject({
      action: 'fetch-complement', reason: 'missing',
    })
  })

  it('requires the profile fields used by the new HTML before reusing the core profile', () => {
    expect(planRaioxComplements([{
      name: 'profile-extra', period: 'latest', fields: ['industry', 'country'],
    }]).find(item => item.name === 'profile-extra')).toMatchObject({
      action: 'fetch-complement', reason: 'coverage-insufficient',
    })
    expect(planRaioxComplements([{
      name: 'profile-extra', period: 'latest',
      fields: ['ceo', 'fullTimeEmployees', 'country', 'industry'],
    }]).find(item => item.name === 'profile-extra')).toMatchObject({ action: 'reuse-core' })
  })

  it('keeps a unique deterministic inventory with bounded reference coverage', () => {
    expect(new Set(RAIOX_COMPLEMENT_REQUIREMENTS.map(item => item.name)).size)
      .toBe(RAIOX_COMPLEMENT_REQUIREMENTS.length)
    expect(RAIOX_COMPLEMENT_REQUIREMENTS.map(item => item.name)).toEqual(
      planRaioxComplements([]).map(item => item.name),
    )
    for (const item of RAIOX_COMPLEMENT_REQUIREMENTS) {
      if (item.minRecords !== undefined) expect(item.minRecords).toBeLessThanOrEqual(60)
      if (item.minYears !== undefined) expect(item.minYears).toBeLessThanOrEqual(5)
    }
  })
})
