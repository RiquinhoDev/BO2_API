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

const internalMaintenanceRoutes: readonly [string, string][] = [
  ['POST', '/api/dashboard/materialized-stats/rebuild'],
  ['POST', '/api/test/history/populate-retroactive'],
]

const convergentMixedRoutes: readonly [string, string, string][] = [
  ['GET', '/api/guru/sync/email/:email', 'guru-email-state-converges'],
  ['POST', '/api/ac/contact/:email/sync', 'ac-contact-state-upsert-converges'],
  ['POST', '/api/guru/trials/sync', 'guru-trial-state-set-converges'],
  ['POST', '/api/sync/curseduca', 'universal-sync-unique-enrollment-converges'],
  ['POST', '/api/sync/hotmart', 'universal-sync-unique-enrollment-converges'],
]

const internalReclassifications: readonly [
  string,
  string,
  'internal-write' | 'super-admin',
][] = [
  ['POST', '/api/guru/webhooks/:id/reprocess', 'super-admin'],
  ['POST', '/api/guru/webhooks/migrate-source', 'super-admin'],
  ['PUT', '/api/curseduca/user/:userId/classes', 'internal-write'],
]

type ProviderScope = 'mixed' | 'provider'

type ProviderScopeRoute = readonly [
  method: string,
  path: string,
  scope: ProviderScope,
  provider: string,
  bulk: boolean,
]

const factualProviderScopes: readonly ProviderScopeRoute[] = [
  ['POST', '/api/classes/syncComplete', 'mixed', 'hotmart', true],
  ['POST', '/api/classes/checkAndUpdateClassHistory', 'mixed', 'hotmart', true],
  ['POST', '/api/guru/inactivation/cleanup', 'mixed', 'curseduca', true],
  ['POST', '/api/guru/trials/check-expired', 'mixed', 'guru', true],
  ['POST', '/api/renewal/sync', 'mixed', 'hotmart', true],
  ['POST', '/api/guru/snapshots', 'mixed', 'guru', false],
  ['POST', '/api/guru/snapshots/historical', 'mixed', 'guru', true],
  ['PUT', '/api/guru/snapshots/:year/:month', 'mixed', 'guru', false],
  ['POST', '/api/clareza/refresh', 'mixed', 'fmp', true],
  ['POST', '/api/clareza/top10/refresh', 'mixed', 'fmp', true],
  ['POST', '/api/clareza/raiox/refresh', 'mixed', 'fmp', true],
  ['POST', '/api/clareza/carteira/refresh', 'mixed', 'fmp', true],
  ['POST', '/api/clareza/earnings/refresh', 'mixed', 'fmp', true],
  ['POST', '/api/clareza/comparador/refresh', 'mixed', 'fmp', true],
  ['POST', '/api/guru/inactivation/single', 'provider', 'curseduca', false],
  ['POST', '/api/guru/inactivation/bulk', 'provider', 'curseduca', true],
  ['POST', '/api/cron/tag-rules-only', 'provider', 'activecampaign', true],
  ['POST', '/api/sync/execute-pipeline', 'provider', 'multiple', true],
  ['POST', '/api/cron/jobs/:id/trigger', 'provider', 'multiple', true],
  ['POST', '/api/activecampaign/test-cron', 'provider', 'activecampaign', true],
  ['POST', '/api/activecampaign/products/:productId/tags/sync', 'provider', 'activecampaign', true],
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

  test.each(internalMaintenanceRoutes)(
    '%s %s is high-impact maintenance, not caller bulk',
    (method, path) => {
      const decision = getOps02Decision(method, path)
      if (!decision) throw new Error(`Missing OPS-02 decision for ${method} ${path}`)

      expect(decision.authorization).toBe('super-admin')
      expect(decision.bulk).toBe(false)
      expect(decision.cap).toEqual({
        status: 'not-applicable',
        reason: 'not-caller-bulk',
      })
    },
  )

  test.each(convergentMixedRoutes)(
    '%s %s records verified convergent replay',
    (method, path, reason) => {
      const decision = getOps02Decision(method, path)
      if (!decision) throw new Error(`Missing OPS-02 decision for ${method} ${path}`)

      expect(decision.scope).toBe('mixed')
      expect(decision.authorization).toBe('super-admin')
      expect(decision.idempotency).toEqual({
        status: 'verified',
        reason,
      })
    },
  )

  test.each(internalReclassifications)(
    '%s %s is classified as a local write',
    (method, path, authorization) => {
      const decision = getOps02Decision(method, path)
      if (!decision) throw new Error(`Missing OPS-02 decision for ${method} ${path}`)

      expect(decision.scope).toBe('internal')
      expect(decision.authorization).toBe(authorization)
      expect(decision.idempotency).toEqual({
        status: 'not-applicable',
        reason: 'internal-write',
      })
    },
  )

  test.each(factualProviderScopes)(
    '%s %s records its factual provider scope',
    (method, path, scope, provider, bulk) => {
      const decision = getOps02Decision(method, path)
      if (!decision) throw new Error(`Missing OPS-02 decision for ${method} ${path}`)

      expect(decision.scope).toBe(scope)
      expect(decision.provider).toBe(provider)
      expect(decision.authorization).toBe('super-admin')
      expect(decision.bulk).toBe(bulk)
    },
  )
})
