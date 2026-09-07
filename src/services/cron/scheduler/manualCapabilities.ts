import type { CompositeExecutionOperation } from '../../../models/CompositeExecutionReceipt'
import { MAX_PROVIDER_READ_ITEMS } from '../../../security/providerReadBatchPolicy'

export type CronManualCapabilityStatus = 'implemented' | 'blocked'

export interface CronManualProtectionDecision {
  status: 'verified' | 'required' | 'not-applicable'
  reason: string
  limit?: number
}

export interface CronManualCapability {
  id: string
  status: CronManualCapabilityStatus
  operation: CompositeExecutionOperation
  identity(job: CronManualCapabilityJob): string
  cap: CronManualProtectionDecision
  idempotency: CronManualProtectionDecision
  killSwitch: CronManualProtectionDecision
  dryRun: CronManualProtectionDecision
  blockedReason?: string
}

export interface CronManualExecutionView {
  capability: string
  status: CronManualCapabilityStatus
  cap: CronManualProtectionDecision
  dryRunSupported: boolean
  mutableEnabled: boolean
  blockedReason?: string
}

export interface CronManualCapabilityJob {
  _id: { toString(): string }
  name: string
  syncType: string
  syncConfig?: unknown
  tagRules?: unknown
  tagRuleOptions?: unknown
  __v?: unknown
}

const jobIdentity = (job: CronManualCapabilityJob): string => `cron-job:${job._id.toString()}`

const implemented = (
  id: string,
  operation: CompositeExecutionOperation,
  cap: CronManualProtectionDecision,
  killSwitch: CronManualProtectionDecision,
  identity: (job: CronManualCapabilityJob) => string = jobIdentity,
): CronManualCapability => ({
  id,
  status: 'implemented',
  operation,
  identity,
  cap,
  idempotency: {
    status: 'verified',
    reason: 'composite-execution-durable-receipt-and-owner-fence',
  },
  killSwitch,
  dryRun: {
    status: 'verified',
    reason: 'dry-run-no-provider-or-local-mutation',
  },
})

const blocked = (id: string, reason: string): CronManualCapability => ({
  id,
  status: 'blocked',
  operation: 'cron-job',
  identity: jobIdentity,
  cap: { status: 'required', reason: `${reason}-cap` },
  idempotency: { status: 'required', reason: `${reason}-idempotency` },
  killSwitch: { status: 'required', reason: `${reason}-kill-switch` },
  dryRun: { status: 'required', reason: `${reason}-dry-run` },
  blockedReason: `Capability manual ${id} bloqueada: faltam proteções OPS-02 reais`,
})

const capabilityEntries: readonly {
  matches(job: CronManualCapabilityJob): boolean
  capability: CronManualCapability
}[] = [
  {
    matches: job => job.name === 'CronExecutionCleanup',
    capability: implemented(
      'cron-execution-cleanup',
      'cron-job',
      { status: 'verified', reason: 'cron-execution-cleanup-max-candidates', limit: 20_000 },
      { status: 'verified', reason: 'CRON_EXECUTION_CLEANUP_MUTABLE_EXECUTION_ENABLED' },
    ),
  },
  {
    matches: job => job.name === 'AchievementEvaluation',
    capability: implemented(
      'achievement-evaluation',
      'cron-job',
      { status: 'verified', reason: 'achievement-evaluation-max-users', limit: 20_000 },
      { status: 'verified', reason: 'ACHIEVEMENT_EVALUATION_MUTABLE_EXECUTION_ENABLED' },
    ),
  },
  {
    matches: job => job.name === 'WeeklyTagSnapshot',
    capability: implemented(
      'weekly-tag-snapshot',
      'cron-job',
      { status: 'verified', reason: 'weekly-tag-snapshot-max-contacts', limit: 20_000 },
      { status: 'verified', reason: 'WEEKLY_TAG_SNAPSHOT_MUTABLE_EXECUTION_ENABLED' },
      () => 'weekly-tag-snapshot',
    ),
  },
  {
    matches: job => job.name === 'DiscordRolesSync',
    capability: implemented(
      'discord-roles-sync',
      'cron-job',
      { status: 'verified', reason: 'discord-roles-sync-max-planning-inputs', limit: 20_000 },
      { status: 'verified', reason: 'DISCORD_ROLES_MANUAL_EXECUTION_ENABLED' },
    ),
  },
  {
    matches: job => job.name === 'DiscordScheduledMessages',
    capability: implemented(
      'discord-scheduled-messages',
      'cron-job',
      { status: 'verified', reason: 'discord-scheduled-messages-max-rules', limit: 50 },
      { status: 'verified', reason: 'DISCORD_SCHEDULED_MESSAGES_ENABLED+DISCORD_MESSAGES_ENABLED' },
    ),
  },
  {
    matches: job => job.name === 'RenewalOfferSync',
    capability: implemented(
      'renewal-offer-sync',
      'cron-job',
      {
        status: 'verified',
        reason: 'renewal-offer-sync-max-provider-sales-and-mutations',
        limit: MAX_PROVIDER_READ_ITEMS,
      },
      { status: 'verified', reason: 'RENEWAL_OFFER_MANUAL_EXECUTION_ENABLED' },
    ),
  },
  {
    matches: job => job.name === 'RenewalAcSync',
    capability: implemented(
      'renewal-ac-sync',
      'cron-job',
      { status: 'verified', reason: 'renewal-ac-sync-max-planning-and-refund-inputs', limit: MAX_PROVIDER_READ_ITEMS },
      { status: 'verified', reason: 'RENEWAL_AC_MANUAL_EXECUTION_ENABLED' },
    ),
  },
  {
    matches: job => job.name === 'GuruTrialCheck',
    capability: implemented(
      'guru-trial-check',
      'cron-job',
      { status: 'verified', reason: 'guru-trial-check-max-effective-operations', limit: MAX_PROVIDER_READ_ITEMS },
      { status: 'verified', reason: 'GURU_TRIAL_MANUAL_EXECUTION_ENABLED' },
    ),
  },
  {
    matches: job => job.syncType === 'pipeline',
    capability: implemented(
      'daily-pipeline',
      'sync-pipeline',
      { status: 'verified', reason: 'daily-pipeline-preflight-max-items', limit: 20_000 },
      { status: 'verified', reason: 'SYNC_MUTABLE_EXECUTION_ENABLED' },
      () => 'daily-pipeline',
    ),
  },
]

const unsupported = blocked('unsupported', 'cron-unsupported')

export function getCronManualCapability(job: CronManualCapabilityJob): CronManualCapability {
  return capabilityEntries.find(entry => entry.matches(job))?.capability ?? unsupported
}

export function cronManualFingerprintPayload(job: CronManualCapabilityJob): Record<string, unknown> {
  const capability = getCronManualCapability(job)
  const version = typeof job.__v === 'number' ? job.__v : null
  return {
    entryPoint: 'cron-job-trigger',
    resultContract: 'cron-execution',
    capability: capability.id,
    jobId: job._id.toString(),
    jobName: job.name,
    syncType: job.syncType,
    version,
    syncConfig: job.syncConfig ?? null,
    tagRules: job.tagRules ?? null,
    tagRuleOptions: job.tagRuleOptions ?? null,
  }
}

export function cronManualExecutionView(
  job: CronManualCapabilityJob,
  mutableEnabled: boolean,
  options: { blockedReason?: string } = {},
): CronManualExecutionView {
  const capability = getCronManualCapability(job)
  const isMutableEnabled = capability.status === 'implemented' && mutableEnabled
  return {
    capability: capability.id,
    status: capability.status,
    cap: capability.cap,
    dryRunSupported: capability.dryRun.status === 'verified',
    mutableEnabled: isMutableEnabled,
    ...(capability.status === 'blocked' && capability.blockedReason
      ? { blockedReason: capability.blockedReason }
      : capability.status === 'implemented' && !isMutableEnabled
        ? { blockedReason: options.blockedReason ?? 'Execução mutável desativada pelo backend' }
      : {}),
  }
}

export const cronManualCapabilities = capabilityEntries
