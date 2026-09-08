import type { ReviewedProtectionPolicy } from './ops02ReviewedPolicy'
import { CLAREZA_UNIVERSE } from '../services/clareza/universe/clarezaUniverse.catalog'

export const MAIN_PARITY_PROTECTIONS: Array<[string, ReviewedProtectionPolicy]> = [
  ['POST /api/renewal-hotmart-sales/sync', {
    cap: { status: 'verified', reason: 'active-cohort-max20000-batches200-and-history-max20-pages-per-status', limit: 20000 },
    idempotency: { status: 'verified', reason: 'durable-composite-receipt-and-complete-per-student-history-before-upsert' },
    killSwitch: { status: 'verified', reason: 'SYNC_MUTABLE_EXECUTION_ENABLED' },
    dryRun: { status: 'not-applicable', reason: 'provider-read-only-local-sales-mirror' },
  }],
  ['POST /api/renewal-ac-data/sync', {
    cap: { status: 'verified', reason: 'active-cohort-max20000-keyset-pages200-and-user-lookup-batches200', limit: 20000 },
    idempotency: { status: 'verified', reason: 'durable-composite-receipt-and-per-student-local-mirror-upsert' },
    killSwitch: { status: 'verified', reason: 'SYNC_MUTABLE_EXECUTION_ENABLED' },
    dryRun: { status: 'not-applicable', reason: 'provider-read-only-local-renewal-mirror' },
  }],
  ['POST /api/ac-tag-watch/correr', {
    cap: { status: 'verified', reason: 'provider-read-budget20000-and-event-cap20000-before-ordered-write-batches200', limit: 20000 },
    idempotency: { status: 'verified', reason: 'durable-composite-receipt-and-unique-event-key-upsert' },
    killSwitch: { status: 'verified', reason: 'SYNC_MUTABLE_EXECUTION_ENABLED' },
    dryRun: { status: 'verified', reason: 'default-preview-without-receipt-event-or-mirror-writes' },
  }],
  ['POST /api/renewal-ac/turma-tags/sync', {
    cap: { status: 'verified', reason: 'timeline-cohort-max20000-at-most-one-provider-tag-application-per-timeline', limit: 20000 },
    idempotency: { status: 'verified', reason: 'durable-composite-receipt-existing-tag-check-and-ownership-before-effects' },
    killSwitch: { status: 'verified', reason: 'SYNC_MUTABLE_EXECUTION_ENABLED' },
    dryRun: { status: 'verified', reason: 'default-preview-no-receipt-audit-or-provider-writes' },
  }],
  ['POST /api/renewal-ac/refunds/handle', {
    cap: { status: 'verified', reason: 'history-sales-and-planned-tag-removal-caps20000-before-effects', limit: 20000 },
    idempotency: { status: 'verified', reason: 'durable-composite-receipt-strict-tag-removal-and-ownership-before-effects' },
    killSwitch: { status: 'verified', reason: 'SYNC_MUTABLE_EXECUTION_ENABLED' },
    dryRun: { status: 'verified', reason: 'default-preview-without-receipt-local-or-provider-writes' },
  }],
  ['POST /api/renewal-timeline/generate', {
    cap: { status: 'verified', reason: 'complete-cohort-cap20000-and-ordered-write-batches200', limit: 20000 },
    idempotency: { status: 'verified', reason: 'durable-composite-receipt-and-ownership-before-each-batch' },
    killSwitch: { status: 'verified', reason: 'SYNC_MUTABLE_EXECUTION_ENABLED' },
    dryRun: { status: 'not-applicable', reason: 'local-derived-timeline-generation' },
  }],
  ['POST /api/ac-tag-watch/lotes/:lote/aceitar', {
    cap: { status: 'verified', reason: 'sentinel201-before-update-of-at-most200-explicit-ids', limit: 200 },
    idempotency: { status: 'verified', reason: 'durable-composite-receipt-and-open-state-compare-and-set' },
    killSwitch: { status: 'verified', reason: 'SYNC_MUTABLE_EXECUTION_ENABLED' },
    dryRun: { status: 'not-applicable', reason: 'local-audit-queue-acceptance' },
  }],
  ['POST /api/products-sales-performance/sync', {
    cap: { status: 'verified', reason: 'provider-streams-max20000-items-guru-transactions-max20-pages50-per-subscription', limit: 20000 },
    idempotency: { status: 'verified', reason: 'durable-composite-receipt-and-complete-provider-reads-before-monthly-upserts' },
    killSwitch: { status: 'verified', reason: 'SYNC_MUTABLE_EXECUTION_ENABLED' },
    dryRun: { status: 'not-applicable', reason: 'provider-read-only-local-monthly-derived-data' },
  }],
  ['POST /api/clareza/operations', {
    cap: { status: 'verified', reason: 'canonical-static-universe-and-alias-input-max40', limit: CLAREZA_UNIVERSE.length },
    idempotency: { status: 'verified', reason: 'canonical-core-durable-receipt-and-ownership-before-effects' },
    killSwitch: { status: 'verified', reason: 'CLAREZA_CANONICAL_ENABLED+CLAREZA_REFRESH_ENABLED+CLAREZA_FMP_EGRESS_ENABLED' },
    dryRun: { status: 'not-applicable', reason: 'fmp-read-only-local-generation-publication' },
  }],
  ['POST /api/discord-renewal/scheduled/:key/send-now', {
    cap: { status: 'verified', reason: 'single-rule-key-and-message-transport-size-limit', limit: 1 },
    idempotency: { status: 'verified', reason: 'shared-cron-manual-rule-month-durable-receipt' },
    killSwitch: { status: 'verified', reason: 'DISCORD_SCHEDULED_MESSAGES_ENABLED+DISCORD_MESSAGES_ENABLED' },
    dryRun: { status: 'verified', reason: 'send-now-dryRun-true-no-provider-or-local-writes' },
  }],
]
