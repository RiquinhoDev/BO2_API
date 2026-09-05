import { getOps02Decision } from '../../src/security/ops02Policy'

function decision(path: string) {
  const result = getOps02Decision('POST', path)
  if (!result) throw new Error(`Missing OPS-02 decision for POST ${path}`)
  return result
}

describe('OPS-02 CursEduca inactivation gaps', () => {
  test('single records the provider replay, kill-switch and dry-run gaps', () => {
    const result = decision('/api/guru/inactivation/single')

    expect(result.cap).toEqual({
      status: 'not-applicable',
      reason: 'not-caller-bulk',
    })
    expect(result.idempotency).toEqual({
      status: 'required',
      reason: 'curseduca-inactivation-single-replay-repeats-provider-call',
    })
    expect(result.killSwitch).toEqual({
      status: 'required',
      reason: 'curseduca-inactivation-no-kill-switch',
    })
    expect(result.dryRun).toEqual({
      status: 'required',
      reason: 'curseduca-inactivation-no-dry-run',
    })
    expect(result.status).toBe('needs-hardening')
  })

  test('bulk records that only explicit ids are capped and all mode is unbounded', () => {
    const result = decision('/api/guru/inactivation/bulk')

    expect(result.cap).toEqual({
      status: 'required',
      reason: 'curseduca-inactivation-all-mode-no-finite-cap',
    })
    expect(result.idempotency).toEqual({
      status: 'required',
      reason: 'curseduca-inactivation-bulk-replay-repeats-provider-call',
    })
    expect(result.killSwitch).toEqual({
      status: 'required',
      reason: 'curseduca-inactivation-no-kill-switch',
    })
    expect(result.dryRun).toEqual({
      status: 'required',
      reason: 'curseduca-inactivation-no-dry-run',
    })
    expect(result.status).toBe('needs-hardening')
  })
})
