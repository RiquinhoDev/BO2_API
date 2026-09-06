import { getOps02Decision } from '../../src/security/ops02Policy'
import { MAX_BULK_OPERATION_ITEMS } from '../../src/security/bulkOperationPolicy'

function decision(path: string) {
  const result = getOps02Decision('POST', path)
  if (!result) throw new Error(`Missing OPS-02 decision for POST ${path}`)
  return result
}

describe('OPS-02 CursEduca inactivation protections', () => {
  test('single proves durable replay and member owner fencing', () => {
    const result = decision('/api/guru/inactivation/single')

    expect(result.cap).toEqual({
      status: 'not-applicable',
      reason: 'not-caller-bulk',
    })
    expect(result.idempotency).toEqual({
      status: 'verified',
      reason: 'curseduca-inactivation-durable-receipt-and-member-owner-fence',
    })
    expect(result.killSwitch).toEqual({
      status: 'verified',
      reason: 'CURSEDUCA_INACTIVATION_ENABLED',
    })
    expect(result.dryRun).toEqual({
      status: 'verified',
      reason: 'dry-run-no-provider-or-local-mutation',
    })
    expect(result.status).toBe('reviewed')
  })

  test('bulk proves durable run replay and finite all-mode hardening', () => {
    const result = decision('/api/guru/inactivation/bulk')

    expect(result.cap).toEqual({
      status: 'verified',
      reason: 'curseduca-inactivation-max-items-per-run',
      limit: MAX_BULK_OPERATION_ITEMS,
    })
    expect(result.idempotency).toEqual({
      status: 'verified',
      reason: 'curseduca-inactivation-durable-receipt-and-member-owner-fence',
    })
    expect(result.killSwitch).toEqual({
      status: 'verified',
      reason: 'CURSEDUCA_INACTIVATION_ENABLED',
    })
    expect(result.dryRun).toEqual({
      status: 'verified',
      reason: 'dry-run-no-provider-or-local-mutation',
    })
    expect(result.status).toBe('reviewed')
  })
})
