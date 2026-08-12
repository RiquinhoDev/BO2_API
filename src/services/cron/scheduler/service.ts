// ════════════════════════════════════════════════════════════
// 📁 src/services/cron/scheduler/service.ts
// Service: CRON Job Management
// Gestão completa de jobs agendados (criar, executar, monitorar)
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import schedule from 'node-schedule'
import CronJobConfig, {
  ICronJobConfig,
  SyncType
} from '../../../models/SyncModels/CronJobConfig'
import { CronExecution } from '../../../models'
import { CreateCronJobDTO, CronExecutionResult, UpdateCronJobDTO } from '../../../types/cron.types'
import { SchedulerRegistry } from './registry'
import { cronExpressionService } from './cronExpression'
import { cronJobDispatcher } from './jobDispatcher'
import { CronJobExecutor } from './jobExecution'
import { createLoggingCronNotification } from './notificationPort'
import { CronJobProvisioner } from './jobProvisioning'
import logger from '../../../utils/logger'

const PROTECTED_JOB_NAMES = new Set(['ClarezaRefresh'])

// ─────────────────────────────────────────────────────────────
// IN-MEMORY SCHEDULER REGISTRY
// ─────────────────────────────────────────────────────────────

const registry = new SchedulerRegistry()
const notificationPort = createLoggingCronNotification(logger)
const defaultCronJobExecutor = new CronJobExecutor({
  dispatch: job => cronJobDispatcher.execute(job),
  saveHistory: async entry => {
    const completedAt = new Date()
    const startedAt = new Date(completedAt.getTime() - entry.duration * 1000)
    await CronExecution.create({
      cronName: entry.jobName,
      executionType: entry.triggeredBy === 'MANUAL' ? 'manual' : 'automatic',
      status: entry.status,
      startTime: startedAt,
      endTime: completedAt,
      duration: entry.duration * 1000,
      tagsApplied: 0,
      emailsSynced: 0,
      studentsProcessed: entry.stats.total,
      errorMessage: entry.errorMessage
    })
  },
  notify: (job, success, stats, errorMessage) =>
    notificationPort.notify(job, success, stats, errorMessage),
  now: Date.now,
  reportError: (message, error) => logger.error(message, error)
})
const systemJobProvisioner = new CronJobProvisioner(
  {
    findByName: name => CronJobConfig.findOne({ name }),
    create: seed => CronJobConfig.create(seed)
  },
  expression => cronExpressionService.calculateNextRun(expression)
)

// ─────────────────────────────────────────────────────────────
// SERVICE CLASS
// ─────────────────────────────────────────────────────────────

export class CronManagementService {
  constructor(private readonly jobExecutor = defaultCronJobExecutor) {}
  private isProtectedJob(job: ICronJobConfig): boolean {
    return PROTECTED_JOB_NAMES.has(job.name)
  }

  // ═══════════════════════════════════════════════════════════
  // CREATE
  // ═══════════════════════════════════════════════════════════

  async createJob(dto: CreateCronJobDTO): Promise<ICronJobConfig> {
    logger.info(`📝 Criando job: ${dto.name}`)

    // Validar cron expression
    this.validateCronExpression(dto.cronExpression)

    // Calcular próxima execução
    const nextRun = this.calculateNextRun(dto.cronExpression)

    // Criar job na BD
const job = await CronJobConfig.create({
  name: dto.name,
  description: dto.description,
  syncType: dto.syncType,
  schedule: {
    cronExpression: dto.cronExpression,
    timezone: dto.timezone || 'Europe/Lisbon',
    enabled: true
  },
  syncConfig: {
    fullSync: dto.syncConfig?.fullSync ?? true,
    includeProgress: dto.syncConfig?.includeProgress ?? true,
    includeTags: dto.syncConfig?.includeTags ?? false,
    batchSize: dto.syncConfig?.batchSize ?? 500
  },
  
  // ✨ NOVO
  tagRules: dto.tagRules || [],
  tagRuleOptions: {
    enabled: dto.tagRuleOptions?.enabled ?? false,
    executeAllRules: dto.tagRuleOptions?.executeAllRules ?? false,
    runInParallel: dto.tagRuleOptions?.runInParallel ?? false,
    stopOnError: dto.tagRuleOptions?.stopOnError ?? false
  },
  
  notifications: {
    enabled: dto.notifications?.enabled ?? false,
    emailOnSuccess: dto.notifications?.emailOnSuccess ?? false,
    emailOnFailure: dto.notifications?.emailOnFailure ?? true,
    recipients: dto.notifications?.recipients ?? [],
    webhookUrl: dto.notifications?.webhookUrl
  },
      retryPolicy: {
        maxRetries: dto.retryPolicy?.maxRetries ?? 3,
        retryDelayMinutes: dto.retryPolicy?.retryDelayMinutes ?? 30,
        exponentialBackoff: dto.retryPolicy?.exponentialBackoff ?? true
      },
      nextRun,
      createdBy: dto.createdBy,
      isActive: true,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0
    })

    // Agendar execução
    await this.scheduleJob(job)

    logger.info(`✅ Job criado: ${job.name} (próxima execução: ${nextRun.toISOString()})`)

    return job
  }

  // ═══════════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════════

  async updateJob(
    jobId: mongoose.Types.ObjectId,
    dto: UpdateCronJobDTO
  ): Promise<ICronJobConfig> {
    logger.info(`📝 Atualizando job: ${jobId}`)

    const job = await CronJobConfig.findById(jobId)
    if (!job) {
      throw new Error('Job não encontrado')
    }

    if (this.isProtectedJob(job)) {
      throw new Error('Job protegido: ClarezaRefresh e apenas leitura')
    }

    // Atualizar campos
    if (dto.name) job.name = dto.name
    if (dto.description) job.description = dto.description

    if (dto.cronExpression) {
      this.validateCronExpression(dto.cronExpression)
      job.schedule.cronExpression = dto.cronExpression
    }

    if (dto.timezone) {
      job.schedule.timezone = dto.timezone
    }

    if (dto.enabled !== undefined) {
      job.schedule.enabled = dto.enabled
    }

    // Atualizar sync config
    if (dto.syncConfig) {
      Object.assign(job.syncConfig, dto.syncConfig)
    }

    // Atualizar notifications
    if (dto.notifications) {
      Object.assign(job.notifications, dto.notifications)
    }

    // Atualizar retry policy
    if (dto.retryPolicy) {
      Object.assign(job.retryPolicy, dto.retryPolicy)
    }

    // Recalcular próxima execução
    job.nextRun = this.calculateNextRun(job.schedule.cronExpression)

    await job.save()

    // Re-agendar
    await this.rescheduleJob(job)

    logger.info(`✅ Job atualizado: ${job.name}`)

    return job
  }

  // ═══════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════

  async deleteJob(jobId: mongoose.Types.ObjectId): Promise<void> {
    logger.info(`🗑️ Deletando job: ${jobId}`)

    const job = await CronJobConfig.findById(jobId)
    if (!job) {
      throw new Error('Job não encontrado')
    }

    if (this.isProtectedJob(job)) {
      throw new Error('Job protegido: ClarezaRefresh nao pode ser apagado')
    }

    // Cancelar schedule
    registry.unregister(jobId.toString())

    // Deletar da BD
    await CronJobConfig.deleteOne({ _id: jobId })

    logger.info(`✅ Job deletado: ${job.name}`)
  }

  // ═══════════════════════════════════════════════════════════
  // TOGGLE (ENABLE/DISABLE)
  // ═══════════════════════════════════════════════════════════

  async toggleJob(
    jobId: mongoose.Types.ObjectId,
    enabled: boolean
  ): Promise<ICronJobConfig> {
    logger.info(`🔄 Toggling job ${jobId}: ${enabled ? 'ENABLED' : 'DISABLED'}`)

    const job = await CronJobConfig.findById(jobId)
    if (!job) {
      throw new Error('Job não encontrado')
    }

    if (this.isProtectedJob(job)) {
      throw new Error('Job protegido: ClarezaRefresh nao pode ser pausado')
    }

    job.schedule.enabled = enabled
    await job.save()

    if (enabled) {
      await this.scheduleJob(job)
    } else {
      registry.unregister(jobId.toString())
    }

    logger.info(`✅ Job ${enabled ? 'ativado' : 'desativado'}: ${job.name}`)

    return job
  }

  // ═══════════════════════════════════════════════════════════
  // SAVE EXECUTION HISTORY
  // ═══════════════════════════════════════════════════════════

  async executeJobManually(
    jobId: mongoose.Types.ObjectId,
    _triggeredBy: mongoose.Types.ObjectId
  ): Promise<CronExecutionResult> {
    const job = await CronJobConfig.findById(jobId)
    if (!job) throw new Error('Job não encontrado')
    if (this.isProtectedJob(job)) {
      throw new Error('Job protegido: ClarezaRefresh nao permite execucao manual')
    }

    return this.jobExecutor.execute(job, {
      triggeredBy: 'MANUAL',
      isolateRecordFailure: true
    })
  }
  // GET JOBS
  // ═══════════════════════════════════════════════════════════

  async getAllJobs(): Promise<ICronJobConfig[]> {
    return CronJobConfig.find()
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email')
  }

  async getActiveJobs(): Promise<ICronJobConfig[]> {
    return CronJobConfig.getActiveJobs()
  }

  async getJobById(
    jobId: mongoose.Types.ObjectId
  ): Promise<ICronJobConfig | null> {
    return CronJobConfig.findById(jobId).populate('createdBy', 'name email')
  }

  async getJobsByType(syncType: SyncType): Promise<ICronJobConfig[]> {
    return CronJobConfig.getJobsByType(syncType)
  }

  // ═══════════════════════════════════════════════════════════
  // SCHEDULING
  // ═══════════════════════════════════════════════════════════

  private async scheduleJob(job: ICronJobConfig): Promise<void> {
    if (!job.schedule.enabled || !job.isActive) {
      logger.info(`⏸️ Job não agendado (disabled): ${job.name}`)
      return
    }

    const jobId = job._id.toString()

    try {
      // Criar scheduled job usando node-schedule
      const scheduledJob = schedule.scheduleJob(
        job.schedule.cronExpression,
        async () => {
          await this.jobExecutor.execute(job, {
            triggeredBy: 'CRON',
            isolateRecordFailure: false
          })
        }
      )

      if (!scheduledJob) {
        throw new Error('Falha ao agendar job - cron expression inválida')
      }
      registry.register(jobId, scheduledJob)

      logger.info(
        `✅ Job agendado: ${job.name} (${job.schedule.cronExpression})`
      )
    } catch (error: any) {
      logger.error(`❌ Erro ao agendar job: ${job.name}`, error)
      throw error
    }
  }

  private async rescheduleJob(job: ICronJobConfig): Promise<void> {
    const jobId = job._id.toString()
    registry.unregister(jobId)
    await this.scheduleJob(job)
  }

  // ═══════════════════════════════════════════════════════════
  // SCHEDULER INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  async initializeScheduler(): Promise<void> {
    logger.info('🚀 Inicializando scheduler...')

    // Limpar registry
    registry.clear()

    await systemJobProvisioner.ensureSystemJobs()

    // Carregar todos os jobs ativos
    const activeJobs = await CronJobConfig.getActiveJobs()

    logger.info(`📋 ${activeJobs.length} jobs ativos encontrados`)

    // Agendar cada job
    for (const job of activeJobs) {
      try {
        await this.scheduleJob(job)
      } catch (error: any) {
        logger.error(`⚠️ Erro ao agendar job ${job.name}:`, error.message)
      }
    }

    logger.info('✅ Scheduler inicializado')
  }

  stopScheduler(): void {
    logger.info('🛑 Parando scheduler...')
    registry.clear()
    logger.info('✅ Scheduler parado')
  }

  isSchedulerActive(): boolean {
    return registry.getAll().size > 0
  }

  // ═══════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════

  private validateCronExpression(expression: string): void {
    cronExpressionService.validate(expression)
  }

  private calculateNextRun(expression: string): Date {
    return cronExpressionService.calculateNextRun(expression)
  }

  getNextExecutions(expression: string, count = 5): Date[] {
    return cronExpressionService.getNextExecutions(expression, count)
  }
}

// ─────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────

export const syncSchedulerService = new CronManagementService()

export default syncSchedulerService
