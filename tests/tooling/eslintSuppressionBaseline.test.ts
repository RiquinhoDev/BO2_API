const suppressions = require('../../eslint-suppressions.json')

type Suppressions = Record<string, Record<string, { count: number }>>

function countSuppressions(matcher: (relativePath: string) => boolean = () => true): number {
  return Object.entries(suppressions as Suppressions)
    .filter(([relativePath]) => matcher(relativePath))
    .reduce(
      (total, [, rules]) => total + Object.values(rules).reduce((ruleTotal, rule) => ruleTotal + rule.count, 0),
      0,
    )
}

function countRule(rule: string, matcher: (relativePath: string) => boolean = () => true): number {
  return Object.entries(suppressions as Suppressions)
    .filter(([relativePath]) => matcher(relativePath))
    .reduce((total, [, rules]) => total + (rules[rule]?.count ?? 0), 0)
}

describe('ESLint suppression baseline', () => {
  test('fails closed on the global total and each tooling-wave ownership', () => {
    const providerTask2 = /^src\/(?:controllers\/(?:acTags|clareza|guru)|services\/(?:activeCampaign|clareza|guru))/
    const syncTask1 = /^src\/services\/syncUtilizadoresServices\//
    const opsTask3 = /^src\/(?:jobs\/|services\/cron\/|services\/dashboard|controllers\/dashboard|controllers\/(?:testHistory|populateHistory|userHistory)|services\/analytics\/)/
    // Dívida herdada do main no rebase: o domínio de renovações e a performance
    // de vendas por produto nunca passaram por estas regras. Fica registada e
    // fixada aqui — não pode crescer, e sai daqui à medida que for tratada.
    const renewalInherited = /^src\/(?:services\/(?:renewal|products)\/|routes\/(?:acRenewalData|hotmartSalesHistory|productSalesPerformance|renewalTimeline)\.routes\.ts)/
    const outsideInherited = (relativePath: string): boolean => !renewalInherited.test(relativePath)

    expect(countSuppressions()).toBe(525)
    expect(countSuppressions((relativePath) => renewalInherited.test(relativePath))).toBe(466)

    // O código desta base continua sem console nem any suprimidos.
    expect(countRule('no-console', outsideInherited)).toBe(0)
    expect(countRule('@typescript-eslint/no-explicit-any', outsideInherited)).toBe(0)

    // E a dívida herdada fica ao número exacto, para não crescer sem se ver.
    expect(countRule('no-console', (relativePath) => renewalInherited.test(relativePath))).toBe(14)
    expect(countRule('@typescript-eslint/no-explicit-any', (relativePath) => renewalInherited.test(relativePath))).toBe(423)

    expect(countSuppressions((relativePath) => syncTask1.test(relativePath))).toBe(15)
    expect(countSuppressions((relativePath) => providerTask2.test(relativePath))).toBe(0)
    expect(countSuppressions((relativePath) => opsTask3.test(relativePath))).toBe(19)
  })
})
