import { getBulkOperationLimit } from '../../src/security/bulkOperationPolicy'
import { getOps02Decision } from '../../src/security/ops02Policy'
import { MAX_PROVIDER_READ_ITEMS } from '../../src/security/providerReadBatchPolicy'

type ExpectedRoute = {
  path: string
  cap: string
  idempotency: string
  killSwitch: string
  dryRun: string
}

const routes: readonly ExpectedRoute[] = [
  {
    path: '/api/cron/jobs/:id/trigger',
    cap: 'cron-trigger-no-aggregate-finite-cap',
    idempotency: 'cron-trigger-no-run-lock',
    killSwitch: 'cron-trigger-no-unified-kill-switch',
    dryRun: 'cron-trigger-no-unified-dry-run',
  },
]

describe('OPS-02 composite runner gaps', () => {
  test.each(routes)('$path records unresolved aggregate protections', (route) => {
    const result = getOps02Decision('POST', route.path)
    if (!result) throw new Error(`Missing OPS-02 decision for POST ${route.path}`)

    expect(result.cap).toEqual({ status: 'required', reason: route.cap })
    expect(result.idempotency).toEqual({ status: 'required', reason: route.idempotency })
    expect(result.killSwitch).toEqual({ status: 'required', reason: route.killSwitch })
    expect(result.dryRun).toEqual({ status: 'required', reason: route.dryRun })
    expect(result.status).toBe('needs-hardening')
  })

  test.each(routes)('$path is outside the central caller bulk guard', (route) => {
    expect(getBulkOperationLimit('POST', route.path)).toBeUndefined()
  })
})

test('pipeline route records the verified composite protections', () => {
  const result = getOps02Decision('POST', '/api/sync/execute-pipeline')
  expect(result).toEqual(expect.objectContaining({
    status: 'reviewed',
    cap: {
      status: 'verified',
      reason: 'daily-pipeline-preflight-and-provider-max-items',
      limit: MAX_PROVIDER_READ_ITEMS,
    },
    idempotency: {
      status: 'verified',
      reason: 'composite-execution-durable-receipt-and-owner-fence',
    },
    killSwitch: { status: 'verified', reason: 'SYNC_MUTABLE_EXECUTION_ENABLED' },
    dryRun: { status: 'verified', reason: 'dry-run-no-provider-or-local-mutation' },
  }))
})
