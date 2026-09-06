import { getBulkOperationLimit } from '../../src/security/bulkOperationPolicy'
import { getOps02Decision } from '../../src/security/ops02Policy'

type ExpectedRoute = {
  path: string
}

const routes: readonly ExpectedRoute[] = [
  {
    path: '/api/activecampaign/test-cron',
  },
  {
    path: '/api/cron/tag-rules-only',
  },
]

describe('OPS-02 ActiveCampaign execution gaps', () => {
  test.each(routes)('$path records its factual execution protections', (route) => {
    const result = getOps02Decision('POST', route.path)
    if (!result) throw new Error(`Missing OPS-02 decision for POST ${route.path}`)

    expect(result.cap).toEqual({
      status: 'verified',
      reason: 'activecampaign-execution-max-active-user-products',
      limit: 200,
    })
    expect(result.idempotency).toEqual({
      status: 'verified',
      reason: 'activecampaign-execution-run-lock-and-replay',
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

  test.each(routes)('$path is outside the central bulk guard', (route) => {
    expect(getBulkOperationLimit('POST', route.path)).toBeUndefined()
  })
})
