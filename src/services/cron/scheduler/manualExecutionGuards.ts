import WeeklyTagMonitoringConfig from '../../../models/tagMonitoring/WeeklyTagMonitoringConfig'
import { HttpError } from '../../../security/errorHandling'
import {
  isAchievementEvaluationMutableExecutionEnabled,
  isCronExecutionCleanupMutableExecutionEnabled,
  isSyncMutableExecutionEnabled,
  isWeeklyTagSnapshotMutableExecutionEnabled,
} from '../../requestDrivenRuntimeConfig'
import { isScheduledMessagesEnabled } from '../../renewal/discordScheduledMessages.service'
import { isMessagesEnabled } from '../../renewal/discord/planning'
import { isManualExecutionEnabled } from '../../renewal/renewalAcSync.service'
import { isRolesManualExecutionEnabled } from '../../renewal/discord/planning'
import type { CronManualCapability } from './manualCapabilities'

export async function assertManualExecutionEnabled(capability: CronManualCapability): Promise<void> {
  if (capability.id === 'cron-execution-cleanup' && !isCronExecutionCleanupMutableExecutionEnabled()) {
    throw new HttpError({
      status: 503,
      code: 'CRON_EXECUTION_CLEANUP_DISABLED',
      publicMessage: 'Limpeza do histórico CRON desativada',
    })
  }
  if (capability.id === 'achievement-evaluation' && !isAchievementEvaluationMutableExecutionEnabled()) {
    throw new HttpError({
      status: 503,
      code: 'ACHIEVEMENT_EVALUATION_DISABLED',
      publicMessage: 'Avaliação mutável de conquistas desativada',
    })
  }
  if (capability.id === 'weekly-tag-snapshot') {
    if (!isWeeklyTagSnapshotMutableExecutionEnabled()) {
      throw new HttpError({
        status: 503,
        code: 'WEEKLY_TAG_SNAPSHOT_DISABLED',
        publicMessage: 'Snapshot semanal desativado',
      })
    }
    const config = await WeeklyTagMonitoringConfig.getConfig()
    if (!config.enabled) {
      throw new HttpError({
        status: 503,
        code: 'WEEKLY_TAG_SNAPSHOT_MONITORING_DISABLED',
        publicMessage: 'Monitorização semanal desativada',
      })
    }
  }
  if (capability.id === 'daily-pipeline' && !isSyncMutableExecutionEnabled()) {
    throw new HttpError({
      status: 503,
      code: 'SYNC_PIPELINE_EXECUTION_DISABLED',
      publicMessage: 'Execução mutável do pipeline desativada',
    })
  }
  if (capability.id === 'discord-scheduled-messages'
    && (!isScheduledMessagesEnabled() || !isMessagesEnabled())) {
    throw new HttpError({
      status: 503,
      code: 'CRON_DISCORD_SCHEDULED_MESSAGES_DISABLED',
      publicMessage: 'Mensagens Discord agendadas desativadas',
    })
  }
  if (capability.id === 'renewal-ac-sync' && !isManualExecutionEnabled()) {
    throw new HttpError({
      status: 503,
      code: 'RENEWAL_AC_MANUAL_EXECUTION_DISABLED',
      publicMessage: 'Execução manual do sync AC de renovação desativada',
    })
  }
  if (capability.id === 'discord-roles-sync' && !isRolesManualExecutionEnabled()) {
    throw new HttpError({
      status: 503,
      code: 'DISCORD_ROLES_MANUAL_EXECUTION_DISABLED',
      publicMessage: 'Execução manual dos cargos Discord desativada',
    })
  }
}
