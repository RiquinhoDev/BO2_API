// ════════════════════════════════════════════════════════════
// 📁 src/services/cron/scheduler.ts
// Service: CRON Job Management
// Gestão completa de jobs agendados (criar, executar, monitorar)
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import schedule, { RecurrenceRule } from 'node-schedule'
import CronJobConfig, {
  ICronJobConfig,
  ILastRunStats,
  SyncType
} from '../../models/SyncModels/CronJobConfig'
import { CronExecution } from '../../models'
import { CreateCronJobDTO, CronExecutionResult, UpdateCronJobDTO } from '../../types/cron.types'
import { SchedulerRegistry } from './scheduler/registry'
import { cronExpressionService } from './scheduler/cronExpression'
import { cronJobDispatcher } from './scheduler/jobDispatcher'

const PROTECTED_JOB_NAMES = new Set(['ClarezaRefresh'])
const RENEWAL_OFFER_SYNC_JOB_NAME = 'RenewalOfferSync'
const ACHIEVEMENT_EVALUATION_JOB_NAME = 'AchievementEvaluation'
const RENEWAL_AC_SYNC_JOB_NAME = 'RenewalAcSync'
const DISCORD_ROLES_SYNC_JOB_NAME = 'DiscordRolesSync'
const DISCORD_SCHEDULED_MESSAGES_JOB_NAME = 'DiscordScheduledMessages'
const AC_EXPIRATION_SYNC_JOB_NAME = 'AcExpirationSync'
const AC_TURMA_TAG_SYNC_JOB_NAME = 'AcTurmaTagSync'
const AC_REFUND_HANDLER_JOB_NAME = 'AcRefundHandler'
const RENEWAL_PIPELINE_JOB_NAME = 'RenewalPipeline'
const SYSTEM_CRON_ADMIN_ID = new mongoose.Types.ObjectId('000000000000000000000001')

// ─────────────────────────────────────────────────────────────
// IN-MEMORY SCHEDULER REGISTRY
// ─────────────────────────────────────────────────────────────

const registry = new SchedulerRegistry()

// ─────────────────────────────────────────────────────────────
// SERVICE CLASS
// ─────────────────────────────────────────────────────────────

export class CronManagementService {
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

  private async saveExecutionHistory(
    job: ICronJobConfig,
    stats: ILastRunStats,
    status: 'success' | 'error',
    duration: number,
    triggeredBy: 'CRON' | 'MANUAL',
    errorMessage?: string
  ): Promise<void> {
    try {
      const startedAt = new Date(Date.now() - duration * 1000)
      const completedAt = new Date()

      await CronExecution.create({
        cronName: job.name,
        executionType: triggeredBy === 'MANUAL' ? 'manual' : 'automatic',
        status: status === 'success' ? 'success' : 'error',
        startTime: startedAt,
        endTime: completedAt,
        duration: duration * 1000, // Converter para ms
        tagsApplied: 0, // CRON jobs não aplicam tags diretamente
        emailsSynced: 0,
        studentsProcessed: stats.total,
        errorMessage
      })

      console.log(`💾 Histórico salvo: ${job.name} (${status})`)
    } catch (error: any) {
      console.error(`⚠️ Erro ao salvar histórico para ${job.name}:`, error.message)
      // Não lançar erro para não quebrar execução do job
    }
  }

  // ═══════════════════════════════════════════════════════════
  // EXECUTE MANUALLY
  // ═══════════════════════════════════════════════════════════

  async executeJobManually(
    jobId: mongoose.Types.ObjectId,
    _triggeredBy: mongoose.Types.ObjectId
  ): Promise<CronExecutionResult> {
    console.log(`▶️ Executando job manualmente: ${jobId}`)

    const job = await CronJobConfig.findById(jobId)
    if (!job) {
      throw new Error('Job não encontrado')
    }

    if (this.isProtectedJob(job)) {
      throw new Error('Job protegido: ClarezaRefresh nao permite execucao manual')
    }

    const startTime = Date.now()

    try {
      // Executar sync
      const result = await cronJobDispatcher.execute(job)

      const duration = Math.round((Date.now() - startTime) / 1000)

      // Registrar execução no job (não deixar falhar a resposta da API)
      try {
        await job.recordExecution(
          result.stats,
          result.success ? 'success' : 'failed',
          duration,
          'MANUAL',
          result.errorMessage
        )
      } catch (recordError: any) {
        console.error(
          `⚠️ Erro ao gravar recordExecution para ${job.name}:`,
          recordError?.message || recordError
        )
      }

      // ✅ NOVO: Salvar no histórico
      await this.saveExecutionHistory(
        job,
        result.stats,
        result.success ? 'success' : 'error',
        duration,
        'MANUAL',
        result.errorMessage
      )

      // Notificar se configurado
      if (job.notifications.enabled) {
        await this.sendNotification(
          job,
          result.success,
          result.stats,
          result.errorMessage
        )
      }

      console.log(`✅ Job executado com sucesso: ${job.name}`)

      return {
        success: result.success,
        duration,
        stats: result.stats,
        errorMessage: result.errorMessage
      }
    } catch (error: any) {
      const duration = Math.round((Date.now() - startTime) / 1000)

      const stats: ILastRunStats = {
        total: 0,
        inserted: 0,
        updated: 0,
        errors: 1,
        skipped: 0
      }

      try {
        await job.recordExecution(
          stats,
          'failed',
          duration,
          'MANUAL',
          error.message
        )
      } catch (recordError: any) {
        console.error(
          `⚠️ Erro ao gravar recordExecution (erro) para ${job.name}:`,
          recordError?.message || recordError
        )
      }

      // ✅ NOVO: Salvar erro no histórico
      await this.saveExecutionHistory(
        job,
        stats,
        'error',
        duration,
        'MANUAL',
        error.message
      )

      console.error(`❌ Erro ao executar job: ${job.name}`, error)

      return {
        success: false,
        duration,
        stats,
        errorMessage: error.message
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
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
    // RenewalPipeline não tem trigger próprio — "schedule.enabled" é só
    // o interruptor lido pelo "1º" (dailyPipeline.service.ts) no fim da
    // sua própria execução. Registá-lo aqui também faria a cadeia correr
    // 2x (uma vez a horas fixas, outra dependente do "1º").
    if (job.name === RENEWAL_PIPELINE_JOB_NAME) {
      console.log(`🔗 ${job.name}: sem trigger próprio — corre dentro do "1º" quando o interruptor está ligado`)
      return
    }

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
          console.log(`🕐 CRON trigger: ${job.name}`)
          
          const startTime = Date.now()

          try {
            const result = await cronJobDispatcher.execute(job)

            const duration = Math.round((Date.now() - startTime) / 1000)

            await job.recordExecution(
              result.stats,
              result.success ? 'success' : 'failed',
              duration,
              'CRON',
              result.errorMessage
            )

            // ✅ NOVO: Salvar no histórico
            await this.saveExecutionHistory(
              job,
              result.stats,
              result.success ? 'success' : 'error',
              duration,
              'CRON',
              result.errorMessage
            )

            if (job.notifications.enabled) {
              await this.sendNotification(
                job,
                result.success,
                result.stats,
                result.errorMessage
              )
            }
          } catch (error: any) {
            console.error(`❌ Erro no job agendado: ${job.name}`, error)

            const duration = Math.round((Date.now() - startTime) / 1000)

            await job.recordExecution(
              { total: 0, inserted: 0, updated: 0, errors: 1, skipped: 0 },
              'failed',
              duration,
              'CRON',
              error.message
            )

            // ✅ NOVO: Salvar erro no histórico
            await this.saveExecutionHistory(
              job,
              { total: 0, inserted: 0, updated: 0, errors: 1, skipped: 0 },
              'error',
              duration,
              'CRON',
              error.message
            )
          }
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

  /**
   * Cron que escreve a "Data de expiração" na AC (único campo escrito —
   * ver acExpirationSync.service.ts). Corre depois do Sync Hotmart e do
   * Sync AC (leitura) para ter dados frescos para comparar. NASCE
   * DESLIGADO; seed create-only — ligar é acção manual na UI, só depois
   * de validar localmente (pedido explícito, 11/08/2026).
   */
  private async ensureAcExpirationSyncJob(): Promise<void> {
    const existingJob = await CronJobConfig.findOne({ name: AC_EXPIRATION_SYNC_JOB_NAME })
    if (existingJob) return

    await CronJobConfig.create({
      name: AC_EXPIRATION_SYNC_JOB_NAME,
      description: 'Escreve a Data de expiração (AC field 332) para alunos cuja última compra na Hotmart (HotmartSaleHistory) ainda não está reflectida na AC (ACRenewalData.purchaseDate) — expiração = compra + 365 dias, arredondada ao 1º dia do mês seguinte. Nunca escreve para reembolsados. Só este campo é escrito.',
      syncType: 'hotmart',
      schedule: {
        cronExpression: '0 8 * * *', // 08:00 Lisboa — depois do Sync Hotmart/AC (leitura)
        timezone: 'Europe/Lisbon',
        enabled: false // ⛔ nasce DESLIGADO — ligar é acção manual na UI
      },
      syncConfig: { fullSync: false, includeProgress: false, includeTags: false, batchSize: 100 },
      tagRules: [],
      tagRuleOptions: { enabled: false, executeAllRules: false, runInParallel: false, stopOnError: false },
      notifications: { enabled: false, emailOnSuccess: false, emailOnFailure: true, recipients: [] },
      retryPolicy: { maxRetries: 1, retryDelayMinutes: 30, exponentialBackoff: false },
      nextRun: this.calculateNextRun('0 8 * * *'),
      createdBy: SYSTEM_CRON_ADMIN_ID,
      isActive: true,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0
    })

    console.log('[AcExpirationSync] Cron criado DESLIGADO (08:00 Lisboa) — ligar manualmente na UI depois de validar localmente')
  }

  /** Interruptor da aplicação de tags de turma dentro do RenewalPipeline. */
  private async ensureAcTurmaTagSyncJob(): Promise<void> {
    const existingJob = await CronJobConfig.findOne({ name: AC_TURMA_TAG_SYNC_JOB_NAME })
    if (existingJob) return

    await CronJobConfig.create({
      name: AC_TURMA_TAG_SYNC_JOB_NAME,
      description: 'Aplica tags de turma na AC depois do Sync AC (tags), usando o resolvedor e confirmando que a tag já existe. Sem trigger próprio: interruptor independente dentro do RenewalPipeline. Nasce desligado.',
      syncType: 'hotmart',
      schedule: { cronExpression: '0 9 * * *', timezone: 'Europe/Lisbon', enabled: false },
      syncConfig: { fullSync: false, includeProgress: false, includeTags: true, batchSize: 100 },
      tagRules: [],
      tagRuleOptions: { enabled: false, executeAllRules: false, runInParallel: false, stopOnError: false },
      notifications: { enabled: false, emailOnSuccess: false, emailOnFailure: true, recipients: [] },
      retryPolicy: { maxRetries: 1, retryDelayMinutes: 30, exponentialBackoff: false },
      nextRun: this.calculateNextRun('0 9 * * *'),
      createdBy: SYSTEM_CRON_ADMIN_ID,
      isActive: true,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0
    })

    console.log('[AcTurmaTagSync] Interruptor criado DESLIGADO — corre apenas como fase gated do RenewalPipeline')
  }

  /** Interruptor do tratamento de reembolsos dentro do RenewalPipeline. */
  private async ensureAcRefundHandlerJob(): Promise<void> {
    const existingJob = await CronJobConfig.findOne({ name: AC_REFUND_HANDLER_JOB_NAME })
    if (existingJob) return

    await CronJobConfig.create({
      name: AC_REFUND_HANDLER_JOB_NAME,
      description: 'Marca reembolsos na nossa BD e remove tags de turma na AC apenas quando o ciclo não tem recompra. Sem trigger próprio: interruptor independente dentro do RenewalPipeline. Nasce desligado.',
      syncType: 'hotmart',
      schedule: { cronExpression: '0 9 * * *', timezone: 'Europe/Lisbon', enabled: false },
      syncConfig: { fullSync: false, includeProgress: false, includeTags: true, batchSize: 100 },
      tagRules: [],
      tagRuleOptions: { enabled: false, executeAllRules: false, runInParallel: false, stopOnError: false },
      notifications: { enabled: false, emailOnSuccess: false, emailOnFailure: true, recipients: [] },
      retryPolicy: { maxRetries: 1, retryDelayMinutes: 30, exponentialBackoff: false },
      nextRun: this.calculateNextRun('0 9 * * *'),
      createdBy: SYSTEM_CRON_ADMIN_ID,
      isActive: true,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0
    })

    console.log('[AcRefundHandler] Interruptor criado DESLIGADO — corre apenas como fase gated do RenewalPipeline')
  }

  /**
   * Cadência sequencial de renovações: Sync Hotmart (vendas) → Sync AC
   * (leitura) → AC Expiração (escrita) → Discord Roles, cada passo só
   * arranca depois do anterior terminar (ver renewalPipeline.service.ts).
   * O passo de escrita tem o SEU PRÓPRIO interruptor ("AcExpirationSync")
   * — ligar só este job corre as partes só-leitura + Discord; a escrita
   * na AC precisa do segundo interruptor também ligado. SEM TRIGGER
   * PRÓPRIO — não
   * é agendado a uma hora fixa (ver scheduleJob(), que ignora este job de
   * propósito). Em vez disso, "schedule.enabled" funciona só como
   * interruptor: o job "1º" (dailyPipeline.service.ts) lê este campo no
   * fim da SUA PRÓPRIA execução e só aí, com o interruptor ligado, chama
   * runRenewalPipeline() — garantia real de "só depois do 1º terminar",
   * não uma estimativa de quanto tempo o 1º costuma demorar (pedido
   * explícito, 11/08/2026: "1 só andava depois de garantido o anterior
   * ter terminado"). cronExpression fica só para referência/UI.
   * NASCE DESLIGADO; seed create-only — ligar é acção manual na UI, só
   * depois de validar localmente.
   */
  private async ensureRenewalPipelineJob(): Promise<void> {
    const existingJob = await CronJobConfig.findOne({ name: RENEWAL_PIPELINE_JOB_NAME })
    if (existingJob) return

    await CronJobConfig.create({
      name: RENEWAL_PIPELINE_JOB_NAME,
      description: 'Cadência sequencial de renovações: Sync Hotmart (vendas) → Sync AC (leitura) → AC Expiração → AC Tags de turma → Reembolsos → Discord Roles → Timelines → reconciliação 334. As três escritas AC têm interruptores próprios. Sem hora própria — corre logo a seguir ao "1º" terminar de facto (chamado a partir de dailyPipeline.service.ts), não a uma hora fixa estimada. Este registo serve só de interruptor (ligar/desligar) + histórico de execuções manuais. Ver renewalPipeline.service.ts.',
      syncType: 'hotmart',
      schedule: {
        cronExpression: '0 5 * * *', // referência apenas — este job não tem trigger próprio, ver scheduleJob()
        timezone: 'Europe/Lisbon',
        enabled: false // ⛔ nasce DESLIGADO — ligar é acção manual na UI (interruptor lido pelo "1º")
      },
      syncConfig: { fullSync: false, includeProgress: false, includeTags: false, batchSize: 100 },
      tagRules: [],
      tagRuleOptions: { enabled: false, executeAllRules: false, runInParallel: false, stopOnError: false },
      notifications: { enabled: false, emailOnSuccess: false, emailOnFailure: true, recipients: [] },
      retryPolicy: { maxRetries: 1, retryDelayMinutes: 30, exponentialBackoff: false },
      nextRun: this.calculateNextRun('0 5 * * *'),
      createdBy: SYSTEM_CRON_ADMIN_ID,
      isActive: true,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0
    })

    console.log('[RenewalPipeline] Interruptor criado DESLIGADO (sem trigger próprio, corre a seguir ao "1º") — ligar manualmente na UI depois de validar localmente')
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
    await this.ensureAcExpirationSyncJob()
    await this.ensureRenewalPipelineJob()
    await this.ensureAcTurmaTagSyncJob()
    await this.ensureAcRefundHandlerJob()

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
  // EXECUTION LOGIC
  // ═══════════════════════════════════════════════════════════

  // NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════

  private async sendNotification(
    job: ICronJobConfig,
    success: boolean,
    stats: ILastRunStats,
    errorMessage?: string
  ): Promise<void> {
    console.log(`📧 Enviando notificação: ${job.name}`)

    const shouldNotify = success
      ? job.notifications.emailOnSuccess
      : job.notifications.emailOnFailure

    if (!shouldNotify) {
      return
    }

    // TODO: Implementar envio de email real
    console.log('Email recipients:', job.notifications.recipients)
    console.log('Success:', success)
    console.log('Stats:', stats)
    if (errorMessage) {
      console.log('Error:', errorMessage)
    }

    // TODO: Implementar webhook se configurado
    if (job.notifications.webhookUrl) {
      console.log('Webhook URL:', job.notifications.webhookUrl)
    }
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
