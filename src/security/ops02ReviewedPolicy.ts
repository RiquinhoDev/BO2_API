export type ReviewedLocalAuthorization = 'internal-write' | 'super-admin'

export interface ReviewedLocalPolicy {
  scope: 'internal'
  authorization: ReviewedLocalAuthorization
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`
}

const VERIFIED_RECONCILIATION_REPLAY = new Map<string, string>([
  [
    'GET /api/guru/sync/email/:email',
    'guru-email-state-converges',
  ],
  [
    'POST /api/ac/contact/:email/sync',
    'ac-contact-state-upsert-converges',
  ],
  [
    'POST /api/guru/trials/sync',
    'guru-trial-state-set-converges',
  ],
  [
    'POST /api/sync/curseduca',
    'universal-sync-unique-enrollment-converges',
  ],
  [
    'POST /api/sync/hotmart',
    'universal-sync-unique-enrollment-converges',
  ],
])

const REVIEWED_LOCAL_POLICY = new Map<string, ReviewedLocalPolicy>([
  [
    'POST /api/guru/webhooks/:id/reprocess',
    { scope: 'internal', authorization: 'super-admin' },
  ],
  [
    'POST /api/guru/webhooks/migrate-source',
    { scope: 'internal', authorization: 'super-admin' },
  ],
  [
    'PUT /api/curseduca/user/:userId/classes',
    { scope: 'internal', authorization: 'internal-write' },
  ],
])

export function getVerifiedReconciliationReplayReason(
  method: string,
  path: string,
): string | undefined {
  return VERIFIED_RECONCILIATION_REPLAY.get(routeKey(method, path))
}

export function getReviewedLocalPolicy(
  method: string,
  path: string,
): ReviewedLocalPolicy | undefined {
  return REVIEWED_LOCAL_POLICY.get(routeKey(method, path))
}
