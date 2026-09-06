import { getBulkOperationLimit } from '../../src/security/bulkOperationPolicy'
import { getOps02Decision } from '../../src/security/ops02Policy'

type ExpectedRoute = {
  path: string
  cap: { status: 'verified' | 'required' | 'not-applicable'; reason: string; limit?: number }
  idempotency: string
}

const PRODUCT_TAG_RECEIPT_REASON = 'activecampaign-product-tag-durable-receipt-and-owner-fence'

const routes: readonly ExpectedRoute[] = [
  {
    path: '/api/activecampaign/product-tags/apply',
    cap: { status: 'not-applicable', reason: 'not-caller-bulk' },
    idempotency: PRODUCT_TAG_RECEIPT_REASON,
  },
  {
    path: '/api/activecampaign/product-tags/remove',
    cap: { status: 'not-applicable', reason: 'not-caller-bulk' },
    idempotency: PRODUCT_TAG_RECEIPT_REASON,
  },
  {
    path: '/api/activecampaign/products/:productId/tags/sync',
    cap: { status: 'verified', reason: 'activecampaign-product-tag-sync-query-cap', limit: 200 },
    idempotency: 'activecampaign-product-tag-durable-receipt-and-owner-fence',
  },
]

describe('OPS-02 ActiveCampaign product-tag protections', () => {
  test.each(routes)('$path records its durable replay protection', (route) => {
    const result = getOps02Decision('POST', route.path)
    if (!result) throw new Error(`Missing OPS-02 decision for POST ${route.path}`)

    expect(result.cap).toEqual(route.cap)
    expect(result.idempotency).toEqual({
      status: 'verified',
      reason: route.idempotency,
    })
    expect(result.killSwitch).toEqual({
      status: 'verified',
      reason: 'AC_TAG_APPLY_ENABLED',
    })
    expect(result.dryRun).toEqual({
      status: 'verified',
      reason: 'dry-run-no-provider-or-local-mutation',
    })
    expect(result.status).toBe('reviewed')
  })

  test('product sync is not covered by the central bulk guard', () => {
    expect(getBulkOperationLimit(
      'POST',
      '/api/activecampaign/products/:productId/tags/sync',
    )).toBeUndefined()
  })
})
