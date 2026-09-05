import { getBulkOperationLimit } from '../../src/security/bulkOperationPolicy'
import { getOps02Decision } from '../../src/security/ops02Policy'

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
  {
    path: '/api/sync/execute-pipeline',
    cap: 'sync-pipeline-no-finite-cap',
    idempotency: 'sync-pipeline-no-run-lock',
    killSwitch: 'sync-pipeline-no-unified-kill-switch',
    dryRun: 'sync-pipeline-no-dry-run',
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
