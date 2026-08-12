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

describe('ESLint suppression baseline', () => {
  test('fails closed on the global total and each tooling-wave ownership', () => {
    const providerTask2 = /^src\/(?:controllers\/(?:acTags|clareza|guru)|services\/(?:activeCampaign|clareza|guru))/
    const syncTask1 = /^src\/services\/syncUtilizadoresServices\//
    const opsTask3 = /^src\/(?:jobs\/|services\/cron\/|services\/dashboard|controllers\/dashboard|controllers\/(?:testHistory|populateHistory|userHistory)|services\/analytics\/)/

    expect(countSuppressions()).toBe(636)
    expect(countSuppressions((relativePath) => syncTask1.test(relativePath))).toBe(49)
    expect(countSuppressions((relativePath) => providerTask2.test(relativePath))).toBe(55)
    expect(countSuppressions((relativePath) => opsTask3.test(relativePath))).toBe(82)
  })
})
