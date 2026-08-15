import { getOps02Decision } from '../../src/security/ops02Policy'

function decision(method: string, path: string) {
  const result = getOps02Decision(method, path)
  if (!result) throw new Error(`Missing OPS-02 decision for ${method} ${path}`)
  return result
}

const cappedMixedRoutes: readonly [string, string, string][] = [
  ['GET', '/api/guru/sync/all', 'guru-best-subscription-state-converges'],
  ['POST', '/api/classes/syncHotmartClasses', 'hotmart-class-upsert-converges'],
  ['POST', '/api/classes/checkAndUpdateClassHistory', 'hotmart-class-diff-history-converges'],
  ['POST', '/api/classes/syncComplete', 'hotmart-complete-sync-state-converges'],
  ['POST', '/api/course-lessons/sync', 'course-lesson-page-upsert-converges'],
  ['POST', '/api/renewal/sync', 'renewal-offer-upsert-converges'],
  ['POST', '/api/guru/snapshots/historical', 'guru-snapshot-period-create-once'],
  ['POST', '/api/guru/trials/check-expired', 'guru-trial-terminal-state-converges'],
  ['POST', '/api/guru/inactivation/cleanup', 'curseduca-inactivation-cleanup-converges'],
]

describe('OPS-02 mixed provider-read wave two protections', () => {
  test.each(cappedMixedRoutes)(
    '%s %s records a finite provider-read cap and convergent replay',
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
      expect(result.status).toBe('reviewed')
    },
  )

  test('POST /api/users/syncDiscordAndHotmart is an internal high-impact file reconciliation', () => {
    const result = decision('POST', '/api/users/syncDiscordAndHotmart')

    expect(result.scope).toBe('internal')
    expect(result.provider).toBeUndefined()
    expect(result.authorization).toBe('super-admin')
    expect(result.bulk).toBe(true)
    expect(result.cap).toEqual({
      status: 'required',
      reason: 'finite-cap-unverified',
    })
    expect(result.idempotency).toEqual({
      status: 'not-applicable',
      reason: 'internal-write',
    })
    expect(result.status).toBe('needs-hardening')
  })
})
