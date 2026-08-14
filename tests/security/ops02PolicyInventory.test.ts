import routeCatalog from '../../src/security/route-catalog.json'
import ops02Inventory from '../../src/contracts/ops02-policy-inventory.json'
import {
  getOps02Decision,
  validateOps02Policy,
  type Ops02Decision,
} from '../../src/security/ops02Policy'

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`
}

const callerBulkRoutes: readonly [string, string][] = [
  ['POST', '/api/users/bulkMerge'],
  ['POST', '/api/users/bulkDelete'],
  ['POST', '/api/users/bulkDeleteUnmatched'],
  ['POST', '/api/guru/inactivation/mark-discrepancies'],
  ['POST', '/api/guru/inactivation/bulk'],
  ['POST', '/api/guru/inactivation/cleanup-duplicates'],
  ['POST', '/api/guru/inactivation/mark-stale-inactive'],
  ['POST', '/api/guru/inactivation/restore'],
  ['POST', '/api/guru/inactivation/fix-to-active'],
  ['POST', '/api/guru/inactivation/diagnose'],
  ['POST', '/api/sync/conflicts/bulk-resolve'],
  ['POST', '/api/sync/conflicts/auto-resolve'],
  ['POST', '/api/test/history/populate-all-users'],
]

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

  test.each(callerBulkRoutes)(
    '%s %s records the verified transversal cap',
    (method, path) => {
      const decision = getOps02Decision(method, path)
      if (!decision) throw new Error(`Missing OPS-02 decision for ${method} ${path}`)

      expect(decision.bulk).toBe(true)
      expect(decision.cap).toEqual({
        status: 'verified',
        reason: 'central-bulk-operation-guard',
        limit: 200,
      })
    },
  )
})
