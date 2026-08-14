import { getOps02Decision } from '../../src/security/ops02Policy'

function decision(method: string, path: string) {
  const result = getOps02Decision(method, path)
  if (!result) throw new Error(`Missing OPS-02 decision for ${method} ${path}`)
  return result
}

describe('OPS-02 existing protection evidence', () => {
  test('ActiveCampaign batch sync records its existing cap and convergent replay', () => {
    const result = decision('POST', '/api/ac/contacts/batch-sync')

    expect(result.cap).toEqual({
      status: 'verified',
      reason: 'ac-batch-sync-max-20',
      limit: 20,
    })
    expect(result.idempotency).toEqual({
      status: 'verified',
      reason: 'ac-contact-state-upsert-converges',
    })
  })

  test('Guru monthly snapshot create cannot duplicate a period on replay', () => {
    const result = decision('POST', '/api/guru/snapshots')

    expect(result.idempotency).toEqual({
      status: 'verified',
      reason: 'guru-snapshot-unique-period-prevents-duplicate',
    })
  })

  test('Discord roles execute records its cap, replay guard, kill switch and plan preview', () => {
    const result = decision('POST', '/api/discord-renewal/execute')

    expect(result.bulk).toBe(true)
    expect(result.cap).toEqual({
      status: 'verified',
      reason: 'discord-roles-max-ops-per-run',
      limit: 10_000,
    })
    expect(result.idempotency).toEqual({
      status: 'verified',
      reason: 'discord-role-change-state-prevents-reapply',
    })
    expect(result.killSwitch).toEqual({
      status: 'verified',
      reason: 'DISCORD_ROLES_SYNC_ENABLED',
    })
    expect(result.dryRun).toEqual({
      status: 'verified',
      reason: 'POST /api/discord-renewal/plan',
    })
  })

  test('Renewal AC execute records its bounded diff-before-write workflow', () => {
    const result = decision('POST', '/api/renewal-ac/execute')

    expect(result.bulk).toBe(true)
    expect(result.cap).toEqual({
      status: 'verified',
      reason: 'renewal-ac-max-changes-per-run',
      limit: 10_000,
    })
    expect(result.idempotency).toEqual({
      status: 'verified',
      reason: 'renewal-ac-change-state-and-provider-diff',
    })
    expect(result.killSwitch).toEqual({
      status: 'verified',
      reason: 'RENEWAL_AC_RUNTIME_SWITCHES',
    })
    expect(result.dryRun).toEqual({
      status: 'verified',
      reason: 'POST /api/renewal-ac/plan',
    })
  })

  test('Renewal AC revert is single-change, replay guarded and kill-switched', () => {
    const result = decision('POST', '/api/renewal-ac/changes/:id/revert')

    expect(result.bulk).toBe(false)
    expect(result.cap).toEqual({
      status: 'not-applicable',
      reason: 'single-provider-change',
    })
    expect(result.idempotency).toEqual({
      status: 'verified',
      reason: 'renewal-ac-applied-to-reverted-state',
    })
    expect(result.killSwitch).toEqual({
      status: 'verified',
      reason: 'RENEWAL_AC_RUNTIME_SWITCHES',
    })
    expect(result.dryRun).toEqual({
      status: 'not-applicable',
      reason: 'single-recorded-reversal',
    })
  })

  test.each([
    '/api/activecampaign/product-tags/apply',
    '/api/activecampaign/product-tags/remove',
  ])('%s does not claim the nonexistent AC_TAG_APPLY_ENABLED switch', (path) => {
    const result = decision('POST', path)

    expect(result.killSwitch).toEqual({
      status: 'required',
      reason: 'provider-kill-switch-unverified',
    })
  })
})
