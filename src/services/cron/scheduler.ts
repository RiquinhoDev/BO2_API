// ════════════════════════════════════════════════════════════
// 📁 src/services/cron/scheduler.ts
// Service: CRON Job Management
// Gestão completa de jobs agendados (criar, executar, monitorar)
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import schedule from 'node-schedule'
import CronJobConfig, {
  ICronJobConfig,
  SyncType
} from '../../models/SyncModels/CronJobConfig'
import { CronExecution } from '../../models'
import { CreateCronJobDTO, CronExecutionResult, UpdateCronJobDTO } from '../../types/cron.types'
import { SchedulerRegistry } from './scheduler/registry'
import { cronExpressionService } from './scheduler/cronExpression'
import { cronJobDispatcher } from './scheduler/jobDispatcher'
import { CronJobExecutor } from './scheduler/jobExecution'
import { createLoggingCronNotification } from './scheduler/notificationPort'
import logger from '../../utils/logger'

const PROTECTED_JOB_NAMES = new Set(['ClarezaRefresh'])
const RENEWAL_OFFER_SYNC_JOB_NAME = 'RenewalOfferSync'
const ACHIEVEMENT_EVALUATION_JOB_NAME = 'AchievementEvaluation'
const RENEWAL_AC_SYNC_JOB_NAME = 'RenewalAcSync'
const DISCORD_ROLES_SYNC_JOB_NAME = 'DiscordRolesSync'
const DISCORD_SCHEDULED_MESSAGES_JOB_NAME = 'DiscordScheduledMessages'
const SYSTEM_CRON_ADMIN_ID = new mongoose.Types.ObjectId('000000000000000000000001')

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
    console.log(`📝 Criando job: ${dto.name}`)

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

    console.log(`✅ Job criado: ${job.name} (próxima execução: ${nextRun.toISOString()})`)

    return job
  }

  // ═══════════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════════

  async updateJob(
    jobId: mongoose.Types.ObjectId,
    dto: UpdateCronJobDTO
  ): Promise<ICronJobConfig> {
    console.log(`📝 Atualizando job: ${jobId}`)

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

    console.log(`✅ Job atualizado: ${job.name}`)

    return job
  }

  // ═══════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════

  async deleteJob(jobId: mongoose.Types.ObjectId): Promise<void> {
    console.log(`🗑️ Deletando job: ${jobId}`)

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

    console.log(`✅ Job deletado: ${job.name}`)
  }

  // ═══════════════════════════════════════════════════════════
  // TOGGLE (ENABLE/DISABLE)
  // ═══════════════════════════════════════════════════════════

  async toggleJob(
    jobId: mongoose.Types.ObjectId,
    enabled: boolean
  ): Promise<ICronJobConfig> {
    console.log(`🔄 Toggling job ${jobId}: ${enabled ? 'ENABLED' : 'DISABLED'}`)

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

    console.log(`✅ Job ${enabled ? 'ativado' : 'desativado'}: ${job.name}`)

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
      console.log(`⏸️ Job não agendado (disabled): ${job.name}`)
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

      console.log(
        `✅ Job agendado: ${job.name} (${job.schedule.cronExpression})`
      )
    } catch (error: any) {
      console.error(`❌ Erro ao agendar job: ${job.name}`, error)
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

  private async ensureRenewalOfferSyncJob(): Promise<void> {
    const cronExpression = '0 5 * * *' // diário às 05:00

    const existingJob = await CronJobConfig.findOne({ name: RENEWAL_OFFER_SYNC_JOB_NAME })
    if (existingJob) {
      // actualizar o agendamento se mudou (ex: era semanal, passou a diário)
      if (existingJob.schedule?.cronExpression !== cronExpression) {
        existingJob.schedule.cronExpression = cronExpression
        existingJob.nextRun = this.calculateNextRun(cronExpression)
        await existingJob.save()
        console.log('[RenewalOfferSync] Cron actualizado para diário (05:00 Lisboa)')
      }
      return
    }

    await CronJobConfig.create({
      name: RENEWAL_OFFER_SYNC_JOB_NAME,
      description: 'Sincroniza diariamente ofertas de renovação OGI a partir da Hotmart',
      syncType: 'hotmart',
      schedule: {
        cronExpression,
        timezone: 'Europe/Lisbon',
        enabled: true
      },
      syncConfig: {
        fullSync: false,
        includeProgress: false,
        includeTags: false,
        batchSize: 100
      },
      tagRules: [],
      tagRuleOptions: {
        enabled: false,
        executeAllRules: false,
        runInParallel: false,
        stopOnError: false
      },
      notifications: {
        enabled: false,
        emailOnSuccess: false,
        emailOnFailure: true,
        recipients: []
      },
      retryPolicy: {
        maxRetries: 2,
        retryDelayMinutes: 30,
        exponentialBackoff: true
      },
      nextRun: this.calculateNextRun(cronExpression),
      createdBy: SYSTEM_CRON_ADMIN_ID,
      isActive: true,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0
    })

    console.log('[RenewalOfferSync] Cron diário criado (05:00 Lisboa)')
  }

  private async ensureAchievementEvaluationJob(): Promise<void> {
    const cronExpression = '30 4 * * *' // diário às 04:30

    const existingJob = await CronJobConfig.findOne({ name: ACHIEVEMENT_EVALUATION_JOB_NAME })
    if (existingJob) {
      if (existingJob.schedule?.cronExpression !== cronExpression) {
        existingJob.schedule.cronExpression = cronExpression
        existingJob.nextRun = this.calculateNextRun(cronExpression)
        await existingJob.save()
        console.log('[AchievementEvaluation] Cron atualizado para diário (04:30 Lisboa)')
      }
      return
    }

    await CronJobConfig.create({
      name: ACHIEVEMENT_EVALUATION_JOB_NAME,
      description: 'Avalia diariamente conquistas OGI para manter o cache atualizado',
      syncType: 'hotmart',
      schedule: {
        cronExpression,
        timezone: 'Europe/Lisbon',
        enabled: true
      },
      syncConfig: {
        fullSync: false,
        includeProgress: false,
        includeTags: false,
        batchSize: 100
      },
      tagRules: [],
      tagRuleOptions: {
        enabled: false,
        executeAllRules: false,
        runInParallel: false,
        stopOnError: false
      },
      notifications: {
        enabled: false,
        emailOnSuccess: false,
        emailOnFailure: true,
        recipients: []
      },
      retryPolicy: {
        maxRetries: 2,
        retryDelayMinutes: 30,
        exponentialBackoff: true
      },
      nextRun: this.calculateNextRun(cronExpression),
      createdBy: SYSTEM_CRON_ADMIN_ID,
      isActive: true,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0
    })

    console.log('[AchievementEvaluation] Cron diário criado (04:30 Lisboa)')
  }

  /**
   * Cron da Fase B (Renovação OGI → AC). NASCE DESLIGADO e o seed é
   * create-only: NUNCA altera enabled/isActive de um job existente —
   * ligar/desligar é decisão exclusiva da UI/BD (kill switch, 13.2/13.3).
   */
  private async ensureRenewalAcSyncJob(): Promise<void> {
    const existingJob = await CronJobConfig.findOne({ name: RENEWAL_AC_SYNC_JOB_NAME })
    if (existingJob) return

    await CronJobConfig.create({
      name: RENEWAL_AC_SYNC_JOB_NAME,
      description: 'Renovação OGI → ActiveCampaign (Fase B): gera plano de alterações (data de expiração + tags de turma + reversões por reembolso) e, só com os switches RENEWAL_AC_* ligados, executa-o. Ver docs/reference/renewal/RENOVACAO_OGI_BO_PLAN.md.',
      syncType: 'hotmart',
      schedule: {
        cronExpression: '30 7 * * *', // 07:30 Lisboa — 3h30 depois do sync "1º" (04:00)
        timezone: 'Europe/Lisbon',
        enabled: false // ⛔ nasce DESLIGADO — ligar é acção manual na UI
      },
      syncConfig: { fullSync: false, includeProgress: false, includeTags: false, batchSize: 100 },
      tagRules: [],
      tagRuleOptions: { enabled: false, executeAllRules: false, runInParallel: false, stopOnError: false },
      notifications: { enabled: false, emailOnSuccess: false, emailOnFailure: true, recipients: [] },
      retryPolicy: { maxRetries: 1, retryDelayMinutes: 30, exponentialBackoff: false },
      nextRun: this.calculateNextRun('30 7 * * *'),
      createdBy: SYSTEM_CRON_ADMIN_ID,
      isActive: true,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0
    })

    console.log('[RenewalAcSync] Cron criado DESLIGADO (07:30 Lisboa) — ligar manualmente na UI quando a feature for activada')
  }

  /**
   * Cron dos cargos de renovação Discord. NASCE DESLIGADO; seed
   * create-only (nunca altera enabled/isActive — kill switch respeitado).
   */
  private async ensureDiscordRolesSyncJob(): Promise<void> {
    const existingJob = await CronJobConfig.findOne({ name: DISCORD_ROLES_SYNC_JOB_NAME })
    if (existingJob) return

    await CronJobConfig.create({
      name: DISCORD_ROLES_SYNC_JOB_NAME,
      description: 'Reconciliação nocturna dos cargos de renovação Discord (R. Janeiro…R. Dezembro) com base na turma Hotmart de cada aluno. Gera plano revisável; só executa com os switches DISCORD_ROLES_* ligados. Ver docs/reference/renewal/RENOVACAO_DISCORD_CARGOS_PLAN.md.',
      syncType: 'hotmart',
      schedule: {
        cronExpression: '30 5 * * *', // 05:30 Lisboa — depois do sync "1º" (04:00)
        timezone: 'Europe/Lisbon',
        enabled: false // ⛔ nasce DESLIGADO — ligar é acção manual na UI
      },
      syncConfig: { fullSync: false, includeProgress: false, includeTags: false, batchSize: 100 },
      tagRules: [],
      tagRuleOptions: { enabled: false, executeAllRules: false, runInParallel: false, stopOnError: false },
      notifications: { enabled: false, emailOnSuccess: false, emailOnFailure: true, recipients: [] },
      retryPolicy: { maxRetries: 1, retryDelayMinutes: 30, exponentialBackoff: false },
      nextRun: this.calculateNextRun('30 5 * * *'),
      createdBy: SYSTEM_CRON_ADMIN_ID,
      isActive: true,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0
    })

    console.log('[DiscordRolesSync] Cron criado DESLIGADO (05:30 Lisboa) — ligar manualmente na UI quando a feature for activada')
  }

  /**
   * Cron das mensagens agendadas de renovação (dia 8 lembrete + dia 15 último aviso
   * ao cargo R.{mês anterior}). NASCE DESLIGADO; seed create-only. Corre DIARIAMENTE
   * às 10:00 Lisboa — é o próprio job que verifica se hoje é dia de alguma regra.
   * Ver secção 12 do docs/reference/renewal/RENOVACAO_DISCORD_CARGOS_PLAN.md.
   */
  private async ensureDiscordScheduledMessagesJob(): Promise<void> {
    const existingJob = await CronJobConfig.findOne({ name: DISCORD_SCHEDULED_MESSAGES_JOB_NAME })
    if (existingJob) return

    await CronJobConfig.create({
      name: DISCORD_SCHEDULED_MESSAGES_JOB_NAME,
      description: 'Mensagens agendadas de renovação no Discord: dia 8 lembrete e dia 15 último aviso, mencionando o cargo R.{mês anterior}. Só envia com DISCORD_SCHEDULED_MESSAGES_ENABLED=true + regra ligada; salta meses sem renovações (cargo sem membros). Ver secção 12 do docs/reference/renewal/RENOVACAO_DISCORD_CARGOS_PLAN.md.',
      syncType: 'hotmart',
      schedule: {
        cronExpression: '0 10 * * *', // 10:00 Lisboa, diário — o job decide se hoje há mensagem
        timezone: 'Europe/Lisbon',
        enabled: false // ⛔ nasce DESLIGADO — ligar é acção manual na UI
      },
      syncConfig: { fullSync: false, includeProgress: false, includeTags: false, batchSize: 100 },
      tagRules: [],
      tagRuleOptions: { enabled: false, executeAllRules: false, runInParallel: false, stopOnError: false },
      notifications: { enabled: false, emailOnSuccess: false, emailOnFailure: true, recipients: [] },
      retryPolicy: { maxRetries: 1, retryDelayMinutes: 30, exponentialBackoff: false },
      nextRun: this.calculateNextRun('0 10 * * *'),
      createdBy: SYSTEM_CRON_ADMIN_ID,
      isActive: true,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0
    })

    console.log('[DiscordScheduledMessages] Cron criado DESLIGADO (10:00 Lisboa, diário) — ligar manualmente na UI quando a feature for activada')
  }

  async initializeScheduler(): Promise<void> {
    console.log('🚀 Inicializando scheduler...')

    // Limpar registry
    registry.clear()

    await this.ensureRenewalOfferSyncJob()
    await this.ensureAchievementEvaluationJob()
    await this.ensureRenewalAcSyncJob()
    await this.ensureDiscordRolesSyncJob()
    await this.ensureDiscordScheduledMessagesJob()

    // Carregar todos os jobs ativos
    const activeJobs = await CronJobConfig.getActiveJobs()

    console.log(`📋 ${activeJobs.length} jobs ativos encontrados`)

    // Agendar cada job
    for (const job of activeJobs) {
      try {
        await this.scheduleJob(job)
      } catch (error: any) {
        console.error(`⚠️ Erro ao agendar job ${job.name}:`, error.message)
      }
    }

    console.log('✅ Scheduler inicializado')
  }

  stopScheduler(): void {
    console.log('🛑 Parando scheduler...')
    registry.clear()
    console.log('✅ Scheduler parado')
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
