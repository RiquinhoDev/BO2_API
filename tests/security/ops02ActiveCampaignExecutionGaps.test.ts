import { getBulkOperationLimit } from '../../src/security/bulkOperationPolicy'
import { getOps02Decision } from '../../src/security/ops02Policy'

type ExpectedRoute = {
  path: string
  cap: string
  idempotency: string
}

const routes: readonly ExpectedRoute[] = [
  {
    path: '/api/activecampaign/test-cron',
    cap: 'activecampaign-test-cron-no-finite-cap',
    idempotency: 'activecampaign-test-cron-no-run-lock',
  },
  {
    path: '/api/cron/tag-rules-only',
    cap: 'activecampaign-tag-rules-only-no-finite-cap',
    idempotency: 'activecampaign-tag-rules-only-no-run-lock',
  },
]

describe('OPS-02 ActiveCampaign execution gaps', () => {
  test.each(routes)('$path records its factual unresolved protections', (route) => {
    const result = getOps02Decision('POST', route.path)
    if (!result) throw new Error(`Missing OPS-02 decision for POST ${route.path}`)

    expect(result.cap).toEqual({ status: 'required', reason: route.cap })
    expect(result.idempotency).toEqual({
      status: 'required',
      reason: route.idempotency,
    })
    expect(result.killSwitch).toEqual({
      status: 'required',
      reason: 'activecampaign-execution-no-kill-switch',
    })
    expect(result.dryRun).toEqual({
      status: 'required',
      reason: 'activecampaign-execution-no-dry-run',
    })
    expect(result.status).toBe('needs-hardening')
  })

  test.each(routes)('$path is outside the central bulk guard', (route) => {
    expect(getBulkOperationLimit('POST', route.path)).toBeUndefined()
  })
})
