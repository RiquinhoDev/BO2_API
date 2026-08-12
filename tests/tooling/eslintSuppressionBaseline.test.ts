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

    const noConsole = Object.values(suppressions as Suppressions).reduce(
      (total, rules) => total + (rules['no-console']?.count ?? 0),
      0,
    )

    const noExplicitAny = Object.values(suppressions as Suppressions).reduce(
      (total, rules) => total + (rules['@typescript-eslint/no-explicit-any']?.count ?? 0),
      0,
    )

    expect(countSuppressions()).toBe(162)
    expect(noConsole).toBe(0)
    expect(noExplicitAny).toBe(0)
    expect(countSuppressions((relativePath) => syncTask1.test(relativePath))).toBe(31)
    expect(countSuppressions((relativePath) => providerTask2.test(relativePath))).toBe(16)
    expect(countSuppressions((relativePath) => opsTask3.test(relativePath))).toBe(32)
  })
})
