// ════════════════════════════════════════════════════════════
// 📁 src/services/cronManagement.service.ts
// Service: CRON Job Management
// Gestão completa de jobs agendados (criar, executar, monitorar)
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, Document, Model } from 'mongoose'
import schedule, { Job } from 'node-schedule'
import CronJobConfig, { ICronJobConfig, ILastRunStats, SyncType } from '../../models/SyncModels/CronJobConfig'
import jobs from '../../jobs'
import cronParser from 'cron-parser'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface CreateJobDTO {
  name: string
  description: string
  syncType: SyncType
  cronExpression: string
  timezone?: string
  syncConfig?: {
    fullSync?: boolean
    includeProgress?: boolean
    includeTags?: boolean
    batchSize?: number
  }
  notifications?: {
    enabled?: boolean
    emailOnSuccess?: boolean
    emailOnFailure?: boolean
    recipients?: string[]
    webhookUrl?: string
  }
  retryPolicy?: {
    maxRetries?: number
    retryDelayMinutes?: number
    exponentialBackoff?: boolean
  }
  createdBy: mongoose.Types.ObjectId
}

interface UpdateJobDTO {
  name?: string
  description?: string
  cronExpression?: string
  timezone?: string
  enabled?: boolean
  syncConfig?: Partial<CreateJobDTO['syncConfig']>
  notifications?: Partial<CreateJobDTO['notifications']>
  retryPolicy?: Partial<CreateJobDTO['retryPolicy']>
}

interface ExecutionResult {
  success: boolean
  duration: number
  stats: ILastRunStats
  errorMessage?: string
}
export interface ICronJobConfigModel extends Model<ICronJobConfig> {
  getActiveJobs(): Promise<ICronJobConfig[]>
  getJobsByType(syncType: SyncType): Promise<ICronJobConfig[]>
  getJobsDueForExecution(): Promise<ICronJobConfig[]>
}

// ─────────────────────────────────────────────────────────────
// IN-MEMORY SCHEDULER REGISTRY
// ─────────────────────────────────────────────────────────────

class SchedulerRegistry {
  private jobs: Map<string, Job> = new Map()

  register(jobId: string, scheduledJob: Job): void {
    // Cancelar job anterior se existir
    if (this.jobs.has(jobId)) {
      this.jobs.get(jobId)?.cancel()
    }
    this.jobs.set(jobId, scheduledJob)
  }

  unregister(jobId: string): void {
    if (this.jobs.has(jobId)) {
      this.jobs.get(jobId)?.cancel()
      this.jobs.delete(jobId)
    }
  }

  get(jobId: string): Job | undefined {
    return this.jobs.get(jobId)
  }

  getAll(): Map<string, Job> {
    return this.jobs
  }

  clear(): void {
    this.jobs.forEach(job => job.cancel())
    this.jobs.clear()
  }
}

const registry = new SchedulerRegistry()

// ─────────────────────────────────────────────────────────────
// SERVICE CLASS
// ─────────────────────────────────────────────────────────────

export class CronManagementService {
  
  // ═══════════════════════════════════════════════════════════
  // CREATE
  // ═══════════════════════════════════════════════════════════
  
  async createJob(dto: CreateJobDTO): Promise<ICronJobConfig> {
    console.log(`📝 Criando job: ${dto.name}`)

    // Validar cron expression
    this.validateCronExpression(dto.cronExpression)

    // Calcular próxima execução
    const nextRun = this.calculateNextRun(dto.cronExpression, dto.timezone)

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
    dto: UpdateJobDTO
  ): Promise<ICronJobConfig> {
    console.log(`📝 Atualizando job: ${jobId}`)

    const job = await CronJobConfig.findById(jobId)
    if (!job) {
      throw new Error('Job não encontrado')
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
    job.nextRun = this.calculateNextRun(
      job.schedule.cronExpression,
      job.schedule.timezone
    )

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
  // EXECUTE MANUALLY
  // ═══════════════════════════════════════════════════════════
  
  async executeJobManually(
    jobId: mongoose.Types.ObjectId,
    triggeredBy: mongoose.Types.ObjectId
  ): Promise<ExecutionResult> {
    console.log(`▶️ Executando job manualmente: ${jobId}`)

    const job = await CronJobConfig.findById(jobId)
    if (!job) {
      throw new Error('Job não encontrado')
    }

    const startTime = Date.now()

    try {
      // Executar sync
      const result = await this.executeSyncJob(job)
      
      const duration = Math.round((Date.now() - startTime) / 1000)

      // Registrar execução
      await job.recordExecution(
        result.stats,
        result.success ? 'success' : 'failed',
        duration,
        'MANUAL',
        result.errorMessage
      )

      // Notificar se configurado
      if (job.notifications.enabled) {
        await this.sendNotification(job, result.success, result.stats, result.errorMessage)
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

      await job.recordExecution(
        stats,
        'failed',
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

  async getJobById(jobId: mongoose.Types.ObjectId): Promise<ICronJobConfig | null> {
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

  // Criar scheduled job usando node-schedule
  const scheduledJob = schedule.scheduleJob(
    job.schedule.cronExpression,
    async () => {
      console.log(`⏰ Executando job agendado: ${job.name}`)
      const startTime = Date.now()

      try {
        const result = await this.executeSyncJob(job)
        const duration = Math.round((Date.now() - startTime) / 1000)

        await job.recordExecution(
          result.stats,
          result.success ? 'success' : 'failed',
          duration,
          'CRON'
        )

        if (job.notifications.enabled) {
          await this.sendNotification(job, result.success, result.stats)
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
      }
    }
  )

  registry.register(jobId, scheduledJob)

  console.log(`✅ Job agendado: ${job.name} (${job.schedule.cronExpression})`)
}

  private async rescheduleJob(job: ICronJobConfig): Promise<void> {
    const jobId = job._id.toString()
    registry.unregister(jobId)
    await this.scheduleJob(job)
  }

  async initializeScheduler(): Promise<void> {
    console.log('🚀 Inicializando scheduler...')

    // Limpar registry
    registry.clear()

    // Carregar todos os jobs ativos
    const activeJobs = await CronJobConfig.getActiveJobs()

    console.log(`📋 ${activeJobs.length} jobs ativos encontrados`)

    // Agendar cada job
    for (const job of activeJobs) {
      await this.scheduleJob(job)
    }

    console.log('✅ Scheduler inicializado')
  }

  async stopScheduler(): Promise<void> {
    console.log('🛑 Parando scheduler...')
    registry.clear()
    console.log('✅ Scheduler parado')
  }

  // ═══════════════════════════════════════════════════════════
  // EXECUTION LOGIC
  // ═══════════════════════════════════════════════════════════
  
  private async executeSyncJob(job: ICronJobConfig): Promise<{
    success: boolean
    stats: ILastRunStats
    errorMessage?: string
  }> {
    console.log(`🔄 Executando sync: ${job.syncType}`)

    // TODO: Implementar chamadas aos controllers de sync reais
    // Por agora, retornamos mock data
    
    switch (job.syncType) {
      case 'hotmart':
        return this.executeHotmartSync(job)
      
      case 'curseduca':
        return this.executeCurseducaSync(job)
      
      case 'discord':
        return this.executeDiscordSync(job)
      
      case 'all':
        return this.executeAllSyncs(job)
      
      default:
        throw new Error(`Tipo de sync desconhecido: ${job.syncType}`)
    }
  }

  private async executeHotmartSync(job: ICronJobConfig): Promise<any> {
    // TODO: Integrar com hotmart.controller.ts
    console.log('🔥 Executando Hotmart sync...')
    
    // Mock implementation
    return {
      success: true,
      stats: {
        total: 100,
        inserted: 10,
        updated: 90,
        errors: 0,
        skipped: 0
      }
    }
  }

  private async executeCurseducaSync(job: ICronJobConfig): Promise<any> {
    // TODO: Integrar com curseducaSyncV2.ts
    console.log('📚 Executando CursEduca sync...')
    
    // Mock implementation
    return {
      success: true,
      stats: {
        total: 50,
        inserted: 5,
        updated: 45,
        errors: 0,
        skipped: 0
      }
    }
  }

  private async executeDiscordSync(job: ICronJobConfig): Promise<any> {
    // TODO: Integrar com discordSync.ts
    console.log('💬 Executando Discord sync...')
    
    // Mock implementation
    return {
      success: true,
      stats: {
        total: 200,
        inserted: 20,
        updated: 180,
        errors: 0,
        skipped: 0
      }
    }
  }

  private async executeAllSyncs(job: ICronJobConfig): Promise<any> {
    console.log('🔄 Executando TODOS os syncs...')
    
    const results = await Promise.allSettled([
      this.executeHotmartSync(job),
      this.executeCurseducaSync(job),
      this.executeDiscordSync(job)
    ])

    // Agregar resultados
    const aggregated = {
      success: results.every(r => r.status === 'fulfilled' && r.value.success),
      stats: {
        total: 0,
        inserted: 0,
        updated: 0,
        errors: 0,
        skipped: 0
      }
    }

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        aggregated.stats.total += result.value.stats.total
        aggregated.stats.inserted += result.value.stats.inserted
        aggregated.stats.updated += result.value.stats.updated
        aggregated.stats.errors += result.value.stats.errors
        aggregated.stats.skipped += result.value.stats.skipped
      }
    })

    return aggregated
  }

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
  try {
    cronParser.parseExpression(expression)
  } catch (error) {
    throw new Error(`Cron expression inválida: ${expression}`)
  }
}


private calculateNextRun(
  expression: string,
  timezone: string = 'Europe/Lisbon'
): Date {
  try {
    const options = {
      currentDate: new Date(),
      tz: timezone
    }

    const interval = cronParser.parseExpression(expression, options)
    return interval.next().toDate()
  } catch (error) {
    console.error('Erro ao calcular próxima execução:', error)
    // Fallback: próxima hora
    const next = new Date()
    next.setHours(next.getHours() + 1, 0, 0, 0)
    return next
  }
}


getNextExecutions(
  expression: string,
  count: number = 5,
  timezone: string = 'Europe/Lisbon'
): Date[] {
  try {
    const options = {
      currentDate: new Date(),
      tz: timezone
    }

    const interval = cronParser.parseExpression(expression, options)
    const executions: Date[] = []

    for (let i = 0; i < count; i++) {
      executions.push(interval.next().toDate())
    }

    return executions
  } catch (error) {
    console.error('Erro ao calcular próximas execuções:', error)
    return []
  }
}

}

// ─────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────

export const cronManagementService = new CronManagementService()

export default cronManagementService