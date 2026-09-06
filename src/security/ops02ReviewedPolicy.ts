import { MAX_BULK_OPERATION_ITEMS } from './bulkOperationPolicy'
import { MAX_PROVIDER_READ_ITEMS } from './providerReadBatchPolicy'
import { REVIEWED_PROTECTION_POLICY_TAIL } from './ops02ReviewedProtectionPolicyTail'

export type ReviewedLocalAuthorization = 'internal-write' | 'super-admin'

export interface ReviewedLocalPolicy {
  scope: 'internal'
  authorization: ReviewedLocalAuthorization
  bulk?: boolean
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
  [
    'POST /api/users/:id/sync',
    { scope: 'internal', authorization: 'internal-write' },
  ],
  [
    'POST /api/users/student/:id/sync',
    { scope: 'internal', authorization: 'internal-write' },
  ],
  [
    'POST /api/users/syncDiscordAndHotmart',
    { scope: 'internal', authorization: 'super-admin' },
  ],
  [
    'POST /api/tags/evaluate',
    { scope: 'internal', authorization: 'super-admin', bulk: false },
  ],
  [
    'POST /api/tags/evaluate-batch',
    { scope: 'internal', authorization: 'super-admin', bulk: true },
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

const providerReadCap: ReviewedProtection = {
  status: 'verified',
  reason: 'provider-read-max-items',
  limit: MAX_PROVIDER_READ_ITEMS,
}

function clarezaStaticUniverseCap(limit: number): ReviewedProtection {
  return {
    status: 'verified',
    reason: 'clareza-static-universe-max-items',
    limit,
  }
}

const clarezaRefreshReceipt: ReviewedProtection = {
  status: 'verified',
  reason: 'clareza-refresh-durable-receipt-and-local-write-fence',
}

const REVIEWED_PROTECTION_POLICY = new Map<string, ReviewedProtectionPolicy>([
  [
    'POST /api/guru/webhooks/migrate-source',
    {
      cap: {
        status: 'verified',
        reason: 'guru-webhook-source-migration-max-items',
        limit: MAX_BULK_OPERATION_ITEMS,
      },
    },
  ],
  [
    'POST /api/users/syncDiscordAndHotmart',
    {
      cap: {
        status: 'verified',
        reason: 'discord-identity-import-max-records',
        limit: MAX_BULK_OPERATION_ITEMS,
      },
    },
  ],
  [
    'POST /api/cron/jobs/:id/trigger',
    {
      cap: { status: 'required', reason: 'cron-trigger-no-aggregate-finite-cap' },
      idempotency: { status: 'required', reason: 'cron-trigger-no-run-lock' },
      killSwitch: { status: 'required', reason: 'cron-trigger-no-unified-kill-switch' },
      dryRun: { status: 'required', reason: 'cron-trigger-no-unified-dry-run' },
    },
  ],
  [
    'POST /api/sync/execute-pipeline',
    {
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
    },
  ],
  [
    'POST /api/activecampaign/test-cron',
    {
      cap: {
        status: 'verified',
        reason: 'activecampaign-execution-max-active-user-products',
        limit: MAX_BULK_OPERATION_ITEMS,
      },
      idempotency: { status: 'verified', reason: 'activecampaign-execution-run-lock-and-replay' },
      killSwitch: { status: 'verified', reason: 'AC_TAG_APPLY_ENABLED' },
      dryRun: { status: 'verified', reason: 'dry-run-no-provider-or-local-mutation' },
    },
  ],
  [
    'POST /api/cron/tag-rules-only',
    {
      cap: {
        status: 'verified',
        reason: 'activecampaign-execution-max-active-user-products',
        limit: MAX_BULK_OPERATION_ITEMS,
      },
      idempotency: { status: 'verified', reason: 'activecampaign-execution-run-lock-and-replay' },
      killSwitch: { status: 'verified', reason: 'AC_TAG_APPLY_ENABLED' },
      dryRun: { status: 'verified', reason: 'dry-run-no-provider-or-local-mutation' },
    },
  ],
  [
    'POST /api/activecampaign/product-tags/apply',
    {
      idempotency: {
        status: 'verified',
        reason: 'activecampaign-product-tag-durable-receipt-and-owner-fence',
      },
      killSwitch: { status: 'required', reason: 'activecampaign-product-tag-no-kill-switch' },
      dryRun: { status: 'required', reason: 'activecampaign-product-tag-no-dry-run' },
    },
  ],
  [
    'POST /api/activecampaign/product-tags/remove',
    {
      idempotency: {
        status: 'verified',
        reason: 'activecampaign-product-tag-durable-receipt-and-owner-fence',
      },
      killSwitch: { status: 'required', reason: 'activecampaign-product-tag-no-kill-switch' },
      dryRun: { status: 'required', reason: 'activecampaign-product-tag-no-dry-run' },
    },
  ],
  [
    'POST /api/activecampaign/products/:productId/tags/sync',
    {
      cap: {
        status: 'verified',
        reason: 'activecampaign-product-tag-sync-query-cap',
        limit: MAX_BULK_OPERATION_ITEMS,
      },
      idempotency: {
        status: 'verified',
        reason: 'activecampaign-product-tag-durable-receipt-and-owner-fence',
      },
      killSwitch: { status: 'required', reason: 'activecampaign-product-tag-no-kill-switch' },
      dryRun: { status: 'required', reason: 'activecampaign-product-tag-no-dry-run' },
    },
  ],
  [
    'POST /api/clareza/refresh',
    {
      cap: clarezaStaticUniverseCap(183),
      idempotency: clarezaRefreshReceipt,
    },
  ],
  [
    'POST /api/clareza/top10/refresh',
    {
      cap: clarezaStaticUniverseCap(10),
      idempotency: clarezaRefreshReceipt,
    },
  ],
  [
    'POST /api/clareza/raiox/refresh',
    {
      cap: clarezaStaticUniverseCap(185),
      idempotency: clarezaRefreshReceipt,
    },
  ],
  [
    'POST /api/clareza/carteira/refresh',
    {
      cap: clarezaStaticUniverseCap(731),
      idempotency: clarezaRefreshReceipt,
    },
  ],
  [
    'POST /api/clareza/earnings/refresh',
    {
      cap: clarezaStaticUniverseCap(183),
      idempotency: clarezaRefreshReceipt,
    },
  ],
  [
    'POST /api/clareza/comparador/refresh',
    {
      cap: clarezaStaticUniverseCap(183),
      idempotency: clarezaRefreshReceipt,
    },
  ],
  [
    'POST /api/ac/contacts/batch-sync',
    {
      cap: { status: 'verified', reason: 'ac-batch-sync-max-20', limit: 20 },
      idempotency: { status: 'verified', reason: 'ac-contact-state-upsert-converges' },
    },
  ],
  [
    'GET /api/curseduca/sync/universal',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'curseduca-reconciliation-converges' },
    },
  ],
  [
    'GET /api/curseduca/sync/universal/start',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'curseduca-reconciliation-converges' },
    },
  ],
  [
    'GET /api/hotmart/sync/universal',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'universal-sync-unique-enrollment-converges' },
    },
  ],
  [
    'POST /api/hotmart/sync/universal/progress',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'hotmart-progress-state-replacement-converges' },
    },
  ],
  [
    'POST /api/hotmart/syncProgressOnly',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'hotmart-progress-state-replacement-converges' },
    },
  ],
  [
    'POST /api/sync/curseduca/batch',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'curseduca-reconciliation-converges' },
    },
  ],
  [
    'POST /api/sync/hotmart/batch',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'universal-sync-unique-enrollment-converges' },
    },
  ],
  ...REVIEWED_PROTECTION_POLICY_TAIL,
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
