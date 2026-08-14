export type ReviewedLocalAuthorization = 'internal-write' | 'super-admin'

export interface ReviewedLocalPolicy {
  scope: 'internal'
  authorization: ReviewedLocalAuthorization
}

export interface ReviewedProviderPolicy {
  scope: 'mixed' | 'provider'
  provider: string
  authorization: 'super-admin'
  bulk: boolean
}

export interface ReviewedProtection {
  status: 'verified' | 'required' | 'not-applicable'
  reason: string
  limit?: number
}

export interface ReviewedProtectionPolicy {
  cap?: ReviewedProtection
  idempotency?: ReviewedProtection
  killSwitch?: ReviewedProtection
  dryRun?: ReviewedProtection
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

const REVIEWED_PROVIDER_POLICY = new Map<string, ReviewedProviderPolicy>([
  [
    'POST /api/classes/syncComplete',
    { scope: 'mixed', provider: 'hotmart', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/classes/checkAndUpdateClassHistory',
    { scope: 'mixed', provider: 'hotmart', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/guru/inactivation/cleanup',
    { scope: 'mixed', provider: 'curseduca', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/guru/trials/check-expired',
    { scope: 'mixed', provider: 'guru', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/renewal/sync',
    { scope: 'mixed', provider: 'hotmart', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/guru/snapshots',
    { scope: 'mixed', provider: 'guru', authorization: 'super-admin', bulk: false },
  ],
  [
    'POST /api/guru/snapshots/historical',
    { scope: 'mixed', provider: 'guru', authorization: 'super-admin', bulk: true },
  ],
  [
    'PUT /api/guru/snapshots/:year/:month',
    { scope: 'mixed', provider: 'guru', authorization: 'super-admin', bulk: false },
  ],
  [
    'POST /api/clareza/refresh',
    { scope: 'mixed', provider: 'fmp', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/clareza/top10/refresh',
    { scope: 'mixed', provider: 'fmp', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/clareza/raiox/refresh',
    { scope: 'mixed', provider: 'fmp', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/clareza/carteira/refresh',
    { scope: 'mixed', provider: 'fmp', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/clareza/earnings/refresh',
    { scope: 'mixed', provider: 'fmp', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/clareza/comparador/refresh',
    { scope: 'mixed', provider: 'fmp', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/guru/inactivation/single',
    { scope: 'provider', provider: 'curseduca', authorization: 'super-admin', bulk: false },
  ],
  [
    'POST /api/guru/inactivation/bulk',
    { scope: 'provider', provider: 'curseduca', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/cron/tag-rules-only',
    { scope: 'provider', provider: 'activecampaign', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/sync/execute-pipeline',
    { scope: 'provider', provider: 'multiple', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/cron/jobs/:id/trigger',
    { scope: 'provider', provider: 'multiple', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/activecampaign/test-cron',
    { scope: 'provider', provider: 'activecampaign', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/activecampaign/products/:productId/tags/sync',
    { scope: 'provider', provider: 'activecampaign', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/discord-renewal/execute',
    { scope: 'provider', provider: 'discord', authorization: 'super-admin', bulk: true },
  ],
  [
    'POST /api/renewal-ac/execute',
    { scope: 'provider', provider: 'activecampaign', authorization: 'super-admin', bulk: true },
  ],
])

const REVIEWED_PROTECTION_POLICY = new Map<string, ReviewedProtectionPolicy>([
  [
    'POST /api/ac/contacts/batch-sync',
    {
      cap: { status: 'verified', reason: 'ac-batch-sync-max-20', limit: 20 },
      idempotency: { status: 'verified', reason: 'ac-contact-state-upsert-converges' },
    },
  ],
  [
    'POST /api/guru/snapshots',
    {
      idempotency: {
        status: 'verified',
        reason: 'guru-snapshot-unique-period-prevents-duplicate',
      },
    },
  ],
  [
    'POST /api/discord-renewal/execute',
    {
      cap: { status: 'verified', reason: 'discord-roles-max-ops-per-run', limit: 10_000 },
      idempotency: {
        status: 'verified',
        reason: 'discord-role-change-state-prevents-reapply',
      },
      killSwitch: { status: 'verified', reason: 'DISCORD_ROLES_SYNC_ENABLED' },
      dryRun: { status: 'verified', reason: 'POST /api/discord-renewal/plan' },
    },
  ],
  [
    'POST /api/renewal-ac/execute',
    {
      cap: { status: 'verified', reason: 'renewal-ac-max-changes-per-run', limit: 10_000 },
      idempotency: {
        status: 'verified',
        reason: 'renewal-ac-change-state-and-provider-diff',
      },
      killSwitch: { status: 'verified', reason: 'RENEWAL_AC_RUNTIME_SWITCHES' },
      dryRun: { status: 'verified', reason: 'POST /api/renewal-ac/plan' },
    },
  ],
  [
    'POST /api/renewal-ac/changes/:id/revert',
    {
      cap: { status: 'not-applicable', reason: 'single-provider-change' },
      idempotency: {
        status: 'verified',
        reason: 'renewal-ac-applied-to-reverted-state',
      },
      killSwitch: { status: 'verified', reason: 'RENEWAL_AC_RUNTIME_SWITCHES' },
      dryRun: { status: 'not-applicable', reason: 'single-recorded-reversal' },
    },
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

export function getReviewedProviderPolicy(
  method: string,
  path: string,
): ReviewedProviderPolicy | undefined {
  return REVIEWED_PROVIDER_POLICY.get(routeKey(method, path))
}

export function getReviewedProtectionPolicy(
  method: string,
  path: string,
): ReviewedProtectionPolicy | undefined {
  return REVIEWED_PROTECTION_POLICY.get(routeKey(method, path))
}
