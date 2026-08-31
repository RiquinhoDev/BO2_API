import {
  buildCoreVerdict,
  qualityStyle,
  valuationStyle,
} from '../../../src/services/clareza/core/coreQualityVerdict'

describe('core quality and verdict contract', () => {
  it.each([
    [80, 'MUITO BARATO'], [60, 'BARATO'], [40, 'NEUTRO'], [20, 'CARO'], [19, 'MUITO CARO'],
  ])('keeps valuation boundary %s as %s', (score, label) => {
    expect(valuationStyle(score).label).toBe(label)
  })

  it.each([
    [75, 'EXCELENTE'], [60, 'BOA'], [42, 'RAZOÁVEL'], [28, 'FRACA'], [27, 'MUITO FRACA'],
  ])('keeps quality boundary %s as %s', (score, label) => {
    expect(qualityStyle(score).label).toBe(label)
  })

  it('keeps insufficient data distinct from weak fundamentals', () => {
    expect(buildCoreVerdict(null, 80, false).key).toBe('indefinido')
    expect(buildCoreVerdict(80, 80, true).key).toBe('poucos-dados')
    expect(buildCoreVerdict(80, 80, false).key).toBe('barata-excelente')
    expect(buildCoreVerdict(80, 20, false).key).toBe('barata-fraca')
    expect(buildCoreVerdict(20, 20, false).key).toBe('cara-fraca')
  })
})
