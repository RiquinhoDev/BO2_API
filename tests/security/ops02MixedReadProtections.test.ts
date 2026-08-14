import { getOps02Decision } from '../../src/security/ops02Policy'

function decision(method: string, path: string) {
  const result = getOps02Decision(method, path)
  if (!result) throw new Error(`Missing OPS-02 decision for ${method} ${path}`)
  return result
}

const cappedMixedRoutes: readonly [string, string, string][] = [
  ['GET', '/api/curseduca/sync/universal', 'curseduca-reconciliation-converges'],
  ['GET', '/api/curseduca/sync/universal/start', 'curseduca-reconciliation-converges'],
  ['GET', '/api/hotmart/sync/universal', 'universal-sync-unique-enrollment-converges'],
  ['POST', '/api/hotmart/sync/universal/progress', 'hotmart-progress-state-replacement-converges'],
  ['POST', '/api/hotmart/syncProgressOnly', 'hotmart-progress-state-replacement-converges'],
  ['POST', '/api/sync/curseduca/batch', 'curseduca-reconciliation-converges'],
  ['POST', '/api/sync/hotmart/batch', 'universal-sync-unique-enrollment-converges'],
]

const localNoProviderSyncRoutes: readonly [string, string][] = [
  ['POST', '/api/users/:id/sync'],
  ['POST', '/api/users/student/:id/sync'],
]

describe('OPS-02 mixed provider-read protections', () => {
  test.each(cappedMixedRoutes)(
    '%s %s records the shared provider-read cap and convergent replay',
    (method, path, replayReason) => {
      const result = decision(method, path)

      expect(result.scope).toBe('mixed')
      expect(result.authorization).toBe('super-admin')
      expect(result.bulk).toBe(true)
      expect(result.cap).toEqual({
        status: 'verified',
        reason: 'provider-read-max-items',
        limit: 20_000,
      })
      expect(result.idempotency).toEqual({
        status: 'verified',
        reason: replayReason,
      })
      expect(result.killSwitch).toEqual({
        status: 'not-applicable',
        reason: 'provider-read-only',
      })
      expect(result.dryRun).toEqual({
        status: 'not-applicable',
        reason: 'provider-read-only',
      })
    },
  )

  test.each(localNoProviderSyncRoutes)(
    '%s %s is a local compatibility read behind a write-shaped route',
    (method, path) => {
      const result = decision(method, path)

      expect(result.scope).toBe('internal')
      expect(result.authorization).toBe('internal-write')
      expect(result.bulk).toBe(false)
      expect(result.idempotency).toEqual({
        status: 'not-applicable',
        reason: 'internal-write',
      })
      expect(result.status).toBe('reviewed')
    },
  )
})
