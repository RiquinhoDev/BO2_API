import mongoose from 'mongoose'
import {
  WeeklyNativeTagSnapshot,
  CriticalTag,
  WeeklyTagMonitoringConfig,
} from '../../models/tagMonitoring'
import { IWeeklyNativeTagSnapshot, TagChanges } from '../../models/tagMonitoring/WeeklyNativeTagSnapshot'
import activeCampaignService from '../activeCampaign/activeCampaignService'
import { classifyTags } from '../activeCampaign/nativeTagProtection.service'
import type { StudentChange } from './tagNotification.service'
import User from '../../models/user'
import logger from '../../utils/logger'
import { getStudentsByPriority } from './weekly/studentsByPriority'
import { errorMessage } from '../syncUtilizadoresServices/universalSync/fieldUtils'
import { HttpError } from '../../security/errorHandling'
import type { WeeklyTagSnapshotPlan } from '../../types/cron.types'
import {
  assertOwnership,
  isOwnershipFailure,
  type EmailSelection,
  type SnapshotData,
  type WeeklyTagSnapshotOptions,
} from './weekly/contracts'
import {
  getEmailsToProcess,
} from './weekly/source'
import {
  cleanupOldSnapshots as cleanupOldSnapshotsBounded,
  persistSnapshot,
} from './weekly/snapshotPersistence'
import {
  WEEKLY_TAG_SNAPSHOT_MAX_CONTACTS,
  WeeklyTagCriticalTagLimitError,
  WeeklyTagSnapshotLimitError,
} from './weekly/limits'
import {
  appendCriticalChanges,
  createNotifications,
  criticalChangesFromMap,
  type CriticalChange,
} from './weekly/notifications'

export {
  WEEKLY_TAG_SNAPSHOT_MAX_CONTACTS,
  WEEKLY_TAG_SNAPSHOT_CLEANUP_MAX_CANDIDATES,
  WEEKLY_TAG_SNAPSHOT_MAX_NOTIFICATION_DETAILS,
  WeeklyTagSnapshotLimitError,
} from './weekly/limits'

export type { WeeklyTagSnapshotOptions } from './weekly/contracts'

export interface SnapshotResult {
  success: boolean
  totalStudents: number
  snapshotsCreated: number
  snapshotsInserted?: number
  snapshotsUpdated?: number
  snapshotsSkipped?: number
  inserted?: number
  updated?: number
  skipped?: number
  changesDetected: number
  notificationsCreated: number
  notificationsTruncated?: boolean
  notificationDetails?: number
  duration: string
  errors: number
  mode: 'STUDENTS_ONLY' | 'ALL_CONTACTS'
  dryRun?: true
  truncated?: boolean
  remaining?: number
  plan?: WeeklyTagSnapshotPlan
}

interface SnapshotProcessResult {
  snapshotsInserted: number
  snapshotsUpdated: number
  successful: number
  changes: CriticalChange[]
  errors: number
  notificationsTruncated: boolean
  notificationDetails: number
}

interface LastWeekStats {
  weekNumber: number
  year: number
  snapshots: number
}

interface SnapshotStats {
  totalSnapshots: number
  uniqueStudents: number
  lastWeek: LastWeekStats
}

function isCapacityFailure(error: unknown): boolean {
  return error instanceof WeeklyTagSnapshotLimitError
    || (error instanceof HttpError && error.status === 413)
}

class WeeklyTagMonitoringService {
  private readonly BATCH_SIZE = 50
  private readonly BATCH_DELAY_MS = 1000

  async performWeeklySnapshot(options: WeeklyTagSnapshotOptions = {}): Promise<SnapshotResult> {
    const startTime = Date.now()
    logger.info('═══════════════════════════════════════════════════════════')
    logger.info('🚀 Iniciando Snapshot Semanal de Tags Nativas')
    logger.info('═══════════════════════════════════════════════════════════')

    try {
      const config = await WeeklyTagMonitoringConfig.getConfig()
      if (!config.enabled) {
        logger.warn('⚠️  Sistema de monitorização desativado')
        return this.createEmptyResult(config.scope, options.dryRun === true)
      }

      const mode = config.scope
      logger.info(`📋 Modo: ${mode}`)
      const selection = await this.getEmailsToProcess(mode, options)
      logger.info(`👥 Total de contactos para processar: ${selection.emails.length}`)

      assertOwnership(options)
      const criticalTags = await CriticalTag.findActiveTags(WEEKLY_TAG_SNAPSHOT_MAX_CONTACTS)
      assertOwnership(options)
      if (criticalTags.length > WEEKLY_TAG_SNAPSHOT_MAX_CONTACTS) {
        throw new WeeklyTagCriticalTagLimitError()
      }
      logger.info(`🏷️  Tags críticas ativas: ${criticalTags.length}`)

      const processed = selection.emails.length === 0
        ? {
          snapshotsInserted: 0,
          snapshotsUpdated: 0,
          successful: 0,
          changes: [],
          errors: 0,
          notificationsTruncated: false,
          notificationDetails: 0,
        }
        : await this.processSnapshotsBatch(
          selection.emails,
          criticalTags.map(tag => tag.tagName),
          options,
        )
      const notificationsCreated = await createNotifications(processed.changes, options)
      const cleanup = await cleanupOldSnapshotsBounded(options)
      const duration = this.formatDuration(Date.now() - startTime)
      const snapshotsSkipped = Math.max(0, selection.emails.length - processed.successful)

      const result: SnapshotResult = {
        success: true,
        totalStudents: selection.emails.length,
        snapshotsCreated: processed.snapshotsInserted,
        snapshotsInserted: processed.snapshotsInserted,
        snapshotsUpdated: processed.snapshotsUpdated,
        snapshotsSkipped,
        inserted: options.dryRun === true ? 0 : processed.snapshotsInserted,
        updated: options.dryRun === true ? 0 : processed.snapshotsUpdated,
        skipped: snapshotsSkipped,
        changesDetected: processed.changes.length,
        notificationsCreated,
        notificationsTruncated: processed.notificationsTruncated,
        notificationDetails: processed.notificationDetails,
        duration,
        errors: processed.errors,
        mode,
        truncated: selection.truncated,
        remaining: selection.remaining,
        ...(options.dryRun === true ? { dryRun: true as const } : {}),
      }

      if (options.dryRun === true) {
        result.plan = {
          operation: 'weekly-tag-snapshot',
          dryRun: true,
          scope: mode,
          matching: selection.emails.length,
          wouldSnapshot: processed.successful,
          wouldNotify: processed.changes.length,
          notificationDetails: processed.notificationDetails,
          notificationsTruncated: processed.notificationsTruncated,
          cleanupCandidates: cleanup.candidates,
          cleanupSkipped: cleanup.skipped,
          cleanupTruncated: cleanup.truncated,
          cleanupRemaining: cleanup.remaining,
          limit: WEEKLY_TAG_SNAPSHOT_MAX_CONTACTS,
          truncated: selection.truncated,
          remaining: selection.remaining,
        }
      }

      logger.info('═══════════════════════════════════════════════════════════')
      logger.info('✅ Snapshot Semanal Concluído!')
      logger.info(`⏱️  Duração: ${duration}`)
      logger.info(`📊 Snapshots inseridos: ${processed.snapshotsInserted}`)
      logger.info(`📊 Snapshots atualizados: ${processed.snapshotsUpdated}`)
      logger.info(`📈 Mudanças detectadas: ${processed.changes.length}`)
      logger.info(`🔔 Notificações criadas: ${notificationsCreated}`)
      logger.info(`❌ Erros: ${processed.errors}`)
      logger.info('═══════════════════════════════════════════════════════════')

      return result
    } catch (error: unknown) {
      logger.error('❌ Erro fatal no snapshot semanal:', error)
      throw error
    }
  }

  private getEmailsToProcess(
    mode: 'STUDENTS_ONLY' | 'ALL_CONTACTS',
    options: WeeklyTagSnapshotOptions,
  ): Promise<EmailSelection> {
    return getEmailsToProcess(mode, options)
  }

  private async processSnapshotsBatch(
    emails: string[],
    criticalTagNames: string[],
    options: WeeklyTagSnapshotOptions,
  ): Promise<SnapshotProcessResult> {
    let snapshotsInserted = 0
    let snapshotsUpdated = 0
    let successful = 0
    let errors = 0
    let notificationsTruncated = false
    let notificationDetails = 0
    const changesMap = new Map<string, StudentChange[]>()
    const currentDate = new Date()
    const weekNumber = this.getWeekNumber(currentDate)
    const year = currentDate.getFullYear()

    logger.info(`📅 Semana ${weekNumber}/${year}`)

    for (let i = 0; i < emails.length; i += this.BATCH_SIZE) {
      const batch = emails.slice(i, i + this.BATCH_SIZE)

      for (const email of batch) {
        try {
          const result = await this.captureStudentSnapshot(email, weekNumber, year, options)
          if (!result.success || !result.snapshot) {
            errors++
            continue
          }
          successful++
          if (result.created) snapshotsInserted++
          if (result.updated) snapshotsUpdated++

          if (result.changes) {
            const notificationPlan = await appendCriticalChanges({
              email,
              changes: result.changes,
              snapshot: result.snapshot,
              criticalTagNames,
              changesMap,
              notificationDetails,
              options,
            })
            notificationDetails = notificationPlan.notificationDetails
            notificationsTruncated ||= notificationPlan.truncated
          }
        } catch (error: unknown) {
          if (isOwnershipFailure(error) || isCapacityFailure(error)) throw error
          errors++
          logger.error(`Erro ao processar ${email}:`, errorMessage(error))
        }
      }

      if ((i + this.BATCH_SIZE) % 500 === 0 || i + this.BATCH_SIZE >= emails.length) {
        const processed = Math.min(i + this.BATCH_SIZE, emails.length)
        logger.info(`📊 Progresso: ${processed}/${emails.length} (${((processed / emails.length) * 100).toFixed(1)}%)`)
      }

      if (i + this.BATCH_SIZE < emails.length) {
        await new Promise(resolve => setTimeout(resolve, this.BATCH_DELAY_MS))
      }
    }

    const changes = criticalChangesFromMap(changesMap)
    return {
      snapshotsInserted,
      snapshotsUpdated,
      successful,
      changes,
      errors,
      notificationsTruncated,
      notificationDetails,
    }
  }

  async captureStudentSnapshot(
    email: string,
    weekNumber?: number,
    year?: number,
    options: WeeklyTagSnapshotOptions = {},
  ): Promise<{
    success: boolean
    snapshot?: IWeeklyNativeTagSnapshot
    created?: boolean
    updated?: boolean
    changes?: TagChanges
  }> {
    try {
      const normalizedEmail = email.trim().toLowerCase()

      assertOwnership(options)
      options.phaseHooks?.providerStarted()
      const { tags: allTags } = await activeCampaignService.getContactTagsByEmailStrict(normalizedEmail)
      assertOwnership(options)
      options.phaseHooks?.providerSucceeded()
      const { nativeTags } = classifyTags(allTags || [])

      assertOwnership(options)
      const user = await User.findOne({ email: normalizedEmail }).select('_id')
      assertOwnership(options)
      if (!user) {
        logger.warn(`Utilizador não encontrado na BD: ${normalizedEmail}`)
        return { success: false }
      }

      const currentDate = new Date()
      const currentWeekNumber = weekNumber || this.getWeekNumber(currentDate)
      const currentYear = year || currentDate.getFullYear()
      const data: SnapshotData = {
        email: normalizedEmail,
        userId: user._id as mongoose.Types.ObjectId,
        nativeTags,
        capturedAt: currentDate,
        weekNumber: currentWeekNumber,
        year: currentYear,
      }

      return persistSnapshot(data, options)
    } catch (error: unknown) {
      if (isOwnershipFailure(error) || isCapacityFailure(error)) throw error
      logger.error(`Erro ao capturar snapshot de ${email}:`, errorMessage(error))
      return { success: false }
    }
  }

  async cleanupOldSnapshots(options: WeeklyTagSnapshotOptions = {}): Promise<number> {
    const result = await cleanupOldSnapshotsBounded(options)
    return result.deleted
  }

  async getSnapshotStats(): Promise<SnapshotStats> {
    try {
      const [totalSnapshots, uniqueStudents, lastWeek] = await Promise.all([
        WeeklyNativeTagSnapshot.countDocuments(),
        WeeklyNativeTagSnapshot.distinct('email'),
        this.getLastWeekStats(),
      ])
      return { totalSnapshots, uniqueStudents: uniqueStudents.length, lastWeek }
    } catch (error) {
      logger.error('Erro ao obter estatísticas:', error)
      throw error
    }
  }

  private async getLastWeekStats(): Promise<LastWeekStats> {
    const currentDate = new Date()
    const weekNumber = this.getWeekNumber(currentDate)
    const year = currentDate.getFullYear()
    const snapshots = await WeeklyNativeTagSnapshot.countDocuments({ weekNumber, year })
    return { weekNumber, year, snapshots }
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes === 0) return `${seconds}s`
    return `${minutes}m ${remainingSeconds}s`
  }

  private createEmptyResult(
    mode: 'STUDENTS_ONLY' | 'ALL_CONTACTS',
    dryRun: boolean,
  ): SnapshotResult {
    const result: SnapshotResult = {
      success: false,
      totalStudents: 0,
      snapshotsCreated: 0,
      snapshotsInserted: 0,
      snapshotsUpdated: 0,
      snapshotsSkipped: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      changesDetected: 0,
      notificationsCreated: 0,
      notificationsTruncated: false,
      notificationDetails: 0,
      duration: '0s',
      errors: 0,
      mode,
      truncated: false,
      remaining: 0,
      ...(dryRun ? { dryRun: true as const } : {}),
    }
    if (dryRun) {
      result.plan = {
        operation: 'weekly-tag-snapshot',
        dryRun: true,
        monitoringEnabled: false,
        scope: mode,
        matching: 0,
        wouldSnapshot: 0,
        wouldNotify: 0,
        notificationDetails: 0,
        notificationsTruncated: false,
        cleanupCandidates: 0,
        cleanupSkipped: 0,
        cleanupTruncated: false,
        cleanupRemaining: 0,
        limit: WEEKLY_TAG_SNAPSHOT_MAX_CONTACTS,
        truncated: false,
        remaining: 0,
      }
    }
    return result
  }

  async getStudentsByPriority(params: Parameters<typeof getStudentsByPriority>[0]) {
    return getStudentsByPriority(params)
  }
}

export default new WeeklyTagMonitoringService()
