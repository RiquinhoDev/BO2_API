import routeCatalog from '../../src/security/route-catalog.json'
import ops02Inventory from '../../src/contracts/ops02-policy-inventory.json'
import {
  validateOps02Policy,
  type Ops02Decision,
} from '../../src/security/ops02Policy'

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`
}

describe('OPS-02 policy inventory', () => {
  test('covers every authenticated write or destructive route exactly once', () => {
    const expected = routeCatalog
      .filter((route) => route.access === 'authenticated' && (route.writes || route.destructive))
      .map((route) => routeKey(route.method, route.path))
      .sort()

    const actual = ops02Inventory
      .map((decision) => routeKey(decision.method, decision.path))
      .sort()

    expect(expected).toHaveLength(160)
    expect(actual).toEqual(expected)
    expect(new Set(actual).size).toBe(actual.length)
  })

  test('rejects a missing decision', () => {
    const fixture: readonly Ops02Decision[] = []
    expect(() => validateOps02Policy(fixture)).toThrow(/missing ops-02 decision/i)
  })
})
