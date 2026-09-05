import { getBulkOperationLimit } from '../../src/security/bulkOperationPolicy'
import { getOps02Decision } from '../../src/security/ops02Policy'

type ExpectedRoute = {
  path: string
  cap: { status: 'required' | 'not-applicable'; reason: string }
  idempotency: string
}

const routes: readonly ExpectedRoute[] = [
  {
    path: '/api/activecampaign/product-tags/apply',
    cap: { status: 'not-applicable', reason: 'not-caller-bulk' },
    idempotency: 'activecampaign-product-tag-apply-check-then-write-not-atomic',
  },
  {
    path: '/api/activecampaign/product-tags/remove',
    cap: { status: 'not-applicable', reason: 'not-caller-bulk' },
    idempotency: 'activecampaign-product-tag-remove-check-then-delete-not-atomic',
  },
  {
    path: '/api/activecampaign/products/:productId/tags/sync',
    cap: { status: 'required', reason: 'activecampaign-product-tag-sync-no-finite-cap' },
    idempotency: 'activecampaign-product-tag-sync-contact-get-then-create-not-atomic',
  },
]

describe('OPS-02 ActiveCampaign product-tag gaps', () => {
  test.each(routes)('$path records its factual unresolved protections', (route) => {
    const result = getOps02Decision('POST', route.path)
    if (!result) throw new Error(`Missing OPS-02 decision for POST ${route.path}`)

    expect(result.cap).toEqual(route.cap)
    expect(result.idempotency).toEqual({
      status: 'required',
      reason: route.idempotency,
    })
    expect(result.killSwitch).toEqual({
      status: 'required',
      reason: 'activecampaign-product-tag-no-kill-switch',
    })
    expect(result.dryRun).toEqual({
      status: 'required',
      reason: 'activecampaign-product-tag-no-dry-run',
    })
    expect(result.status).toBe('needs-hardening')
  })

  test('product sync is not covered by the central bulk guard', () => {
    expect(getBulkOperationLimit(
      'POST',
      '/api/activecampaign/products/:productId/tags/sync',
    )).toBeUndefined()
  })
})
