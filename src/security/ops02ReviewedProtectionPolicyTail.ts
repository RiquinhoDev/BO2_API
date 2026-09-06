import type { ReviewedProtectionPolicy } from './ops02ReviewedPolicy'
import { MAX_PROVIDER_READ_ITEMS } from './providerReadBatchPolicy'
import { MAX_BULK_OPERATION_ITEMS } from './bulkOperationPolicy'

const providerReadCap = {
  status: 'verified' as const,
  reason: 'provider-read-max-items',
  limit: MAX_PROVIDER_READ_ITEMS,
}

export const REVIEWED_PROTECTION_POLICY_TAIL: Array<[string, ReviewedProtectionPolicy]> = [
  [
    'GET /api/guru/sync/all',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'guru-best-subscription-state-converges' },
    },
  ],
  [
    'POST /api/classes/syncHotmartClasses',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'hotmart-class-upsert-converges' },
    },
  ],
  [
    'POST /api/classes/checkAndUpdateClassHistory',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'hotmart-class-diff-history-converges' },
    },
  ],
  [
    'POST /api/classes/syncComplete',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'hotmart-complete-sync-state-converges' },
    },
  ],
  [
    'POST /api/course-lessons/sync',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'course-lesson-page-upsert-converges' },
    },
  ],
  [
    'POST /api/renewal/sync',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'renewal-offer-upsert-converges' },
    },
  ],
  [
    'POST /api/guru/snapshots/historical',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'guru-snapshot-period-create-once' },
    },
  ],
  [
    'POST /api/guru/trials/check-expired',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'guru-trial-terminal-state-converges' },
    },
  ],
  [
    'POST /api/guru/inactivation/cleanup',
    {
      cap: providerReadCap,
      idempotency: { status: 'verified', reason: 'curseduca-inactivation-cleanup-converges' },
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
    'PUT /api/guru/snapshots/:year/:month',
    {
      idempotency: {
        status: 'verified',
        reason: 'guru-snapshot-period-replacement-converges',
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
  [
    'POST /api/tags/evaluate-batch',
    {
      cap: { status: 'verified', reason: 'tag-evaluation-max-users', limit: 100 },
    },
  ],
  [
    'POST /api/guru/inactivation/single',
    {
      idempotency: {
        status: 'verified',
        reason: 'curseduca-inactivation-durable-receipt-and-member-owner-fence',
      },
      killSwitch: { status: 'verified', reason: 'CURSEDUCA_INACTIVATION_ENABLED' },
      dryRun: { status: 'verified', reason: 'dry-run-no-provider-or-local-mutation' },
    },
  ],
  [
    'POST /api/guru/inactivation/bulk',
    {
      cap: {
        status: 'verified',
        reason: 'curseduca-inactivation-max-items-per-run',
        limit: MAX_BULK_OPERATION_ITEMS,
      },
      idempotency: {
        status: 'verified',
        reason: 'curseduca-inactivation-durable-receipt-and-member-owner-fence',
      },
      killSwitch: { status: 'verified', reason: 'CURSEDUCA_INACTIVATION_ENABLED' },
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
      killSwitch: { status: 'verified', reason: 'AC_TAG_APPLY_ENABLED' },
      dryRun: { status: 'verified', reason: 'dry-run-no-provider-or-local-mutation' },
    },
  ],
  [
    'POST /api/activecampaign/product-tags/remove',
    {
      idempotency: {
        status: 'verified',
        reason: 'activecampaign-product-tag-durable-receipt-and-owner-fence',
      },
      killSwitch: { status: 'verified', reason: 'AC_TAG_APPLY_ENABLED' },
      dryRun: { status: 'verified', reason: 'dry-run-no-provider-or-local-mutation' },
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
      killSwitch: { status: 'verified', reason: 'AC_TAG_APPLY_ENABLED' },
      dryRun: { status: 'verified', reason: 'dry-run-no-provider-or-local-mutation' },
    },
  ],
  [
    'POST /api/discord-renewal/messages/send',
    {
      idempotency: {
        status: 'verified',
        reason: 'discord-message-durable-receipt-and-provider-audit-fence',
      },
      killSwitch: { status: 'verified', reason: 'DISCORD_MESSAGES_ENABLED' },
      dryRun: { status: 'verified', reason: 'POST /api/discord-renewal/messages/preview' },
    },
  ],
  [
    'POST /api/discord-renewal/scheduled/:key/test',
    {
      idempotency: {
        status: 'verified',
        reason: 'discord-message-durable-receipt-and-provider-audit-fence',
      },
      killSwitch: { status: 'verified', reason: 'DISCORD_MESSAGES_ENABLED' },
      dryRun: { status: 'verified', reason: 'GET /api/discord-renewal/scheduled/:key/preview' },
    },
  ],
  [
    'POST /api/discord-renewal/scheduled/run',
    {
      cap: {
        status: 'verified',
        reason: 'scheduled-rule-query-cap',
        limit: 50,
      },
      idempotency: {
        status: 'verified',
        reason: 'scheduled-rule-month-receipt-and-run-receipt-fence',
      },
      killSwitch: {
        status: 'verified',
        reason: 'DISCORD_SCHEDULED_MESSAGES_ENABLED+DISCORD_MESSAGES_ENABLED',
      },
      dryRun: {
        status: 'verified',
        reason: 'scheduled-run-dry-run-no-provider-or-local-mutation',
      },
    },
  ],
]
