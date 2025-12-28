// ════════════════════════════════════════════════════════════
// 📁 src/services/cronManagement.service.ts
// Service: CRON Job Management
// Gestão completa de jobs agendados (criar, executar, monitorar)
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import schedule, { Job, RecurrenceRule } from 'node-schedule'
import CronJobConfig, {
  ICronJobConfig,
  ILastRunStats,
  SyncType
} from '../../models/SyncModels/CronJobConfig'
import universalSyncService from './universalSyncService'
import curseducaAdapter from './curseducaServices/curseduca.adapter'
import hotmartAdapter from './hotmartServices/hotmart.adapter'
import CronExecution from '../../models/CronExecution'
import { executeDailyPipeline } from './dailyPipeline.service'
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
  
  // ✨ NOVO
  tagRules?: mongoose.Types.ObjectId[]
  tagRuleOptions?: {
    enabled?: boolean
    executeAllRules?: boolean
    runInParallel?: boolean
    stopOnError?: boolean
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

      // Registrar execução no job
      await job.recordExecution(
        result.stats,
        result.success ? 'success' : 'failed',
        duration,
        'MANUAL',
        result.errorMessage
      )

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

      await job.recordExecution(
        stats,
        'failed',
        duration,
        'MANUAL',
        error.message
      )

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
            const result = await this.executeSyncJob(job)

            const duration = Math.round((Date.now() - startTime) / 1000)

            await job.recordExecution(
              result.stats,
              result.success ? 'success' : 'failed',
              duration,
              'CRON'
            )

            // ✅ NOVO: Salvar no histórico
            await this.saveExecutionHistory(
              job,
              result.stats,
              result.success ? 'success' : 'error',
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

  async initializeScheduler(): Promise<void> {
    console.log('🚀 Inicializando scheduler...')

    // Limpar registry
    registry.clear()

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

  // ═══════════════════════════════════════════════════════════
  // EXECUTION LOGIC
  // ═══════════════════════════════════════════════════════════

  private async executeSyncJob(job: ICronJobConfig): Promise<{
    success: boolean
    stats: ILastRunStats
    errorMessage?: string
  }> {
    console.log(`🔄 Executando sync: ${job.syncType}`)

    // TODO: Integrar com os controllers reais
    switch (job.syncType) {
      case 'hotmart':
        return this.executeHotmartSync(job)
      case 'curseduca':
        return this.executeCurseducaSync(job)
      case 'discord':
        return this.executeDiscordSync(job)
      case 'all':
        return this.executeAllSyncs(job)
        case 'pipeline':
    return await this.executePipelineJob(job)
    
      default:
        throw new Error(`Tipo de sync desconhecido: ${job.syncType}`)
    }
  }
private async executePipelineJob(job: ICronJobConfig): Promise<{
  success: boolean
  stats: ILastRunStats
  errorMessage?: string
}> {
  console.log(`🔄 Executando DailyPipeline via job: ${job.name}`)
  
  try {
    const result = await executeDailyPipeline()
    
    const stats: ILastRunStats = {
      total: result.summary.totalUsers + result.summary.totalUserProducts,
      inserted: 0,
      updated: result.summary.engagementUpdated,
      errors: result.errors.length,
      skipped: 0
    }
    
    return {
      success: result.success,
      stats,
      errorMessage: result.errors.length > 0 ? result.errors.join('; ') : undefined
    }
  } catch (error: any) {
    console.error(`❌ Erro ao executar pipeline: ${error.message}`)
    return {
      success: false,
      stats: { total: 0, inserted: 0, updated: 0, errors: 1, skipped: 0 },
      errorMessage: error.message
    }
  }
}
  private async executeHotmartSync(job: ICronJobConfig): Promise<any> {
    console.log('🔥 [CRON] Executando Hotmart sync...')

    try {
      // 1. Buscar dados via Adapter
      const hotmartData = await hotmartAdapter.fetchHotmartDataForSync({
        includeProgress: true,
        includeLessons: true,
        progressConcurrency: 5
      })

      console.log(`✅ [CRON] ${hotmartData.length} users Hotmart preparados`)

      // 2. Executar via Universal Sync
      const result = await universalSyncService.executeUniversalSync({
        syncType: 'hotmart',
        jobName: job.name,
        jobId: job._id.toString(),
        triggeredBy: 'CRON',
        
        fullSync: true,
        includeProgress: true,
        includeTags: false,
        batchSize: 50,
        
        sourceData: hotmartData
      })

      console.log(`✅ [CRON] Hotmart sync completo: ${result.stats.total} users`)

      return {
        success: result.success,
        stats: result.stats
      }

    } catch (error: any) {
      console.error('❌ [CRON] Erro Hotmart sync:', error)
      throw error
    }
  }

  private async executeCurseducaSync(job: ICronJobConfig): Promise<any> {
    console.log('📚 [CRON] Executando CursEduca sync...')

    try {
      // 1. Buscar dados via Adapter
      const curseducaData = await curseducaAdapter.fetchCurseducaDataForSync({
        includeProgress: true,
        includeGroups: true,
        progressConcurrency: 5
      })

      console.log(`✅ [CRON] ${curseducaData.length} users CursEduca preparados`)

      // 2. Executar via Universal Sync
      const result = await universalSyncService.executeUniversalSync({
        syncType: 'curseduca',
        jobName: job.name,
        jobId: job._id.toString(),
        triggeredBy: 'CRON',
        
        fullSync: true,
        includeProgress: true,
        includeTags: false,
        batchSize: 50,
        
        sourceData: curseducaData
      })

      console.log(`✅ [CRON] CursEduca sync completo: ${result.stats.total} users`)

      return {
        success: result.success,
        stats: result.stats
      }

    } catch (error: any) {
      console.error('❌ [CRON] Erro CursEduca sync:', error)
      throw error
    }
  }

  private async executeDiscordSync(job: ICronJobConfig): Promise<any> {
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

    const aggregated = {
      success: results.every(
        r => r.status === 'fulfilled' && r.value.success
      ),
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
    // Validação básica de formato cron (5 ou 6 campos)
    const parts = expression.trim().split(/\s+/)
    
    if (parts.length < 5 || parts.length > 6) {
      throw new Error(
        `Cron expression inválida: "${expression}". Deve ter 5 ou 6 campos.`
      )
    }

    // Tentar agendar um teste (node-schedule valida automaticamente)
    try {
      const testJob = schedule.scheduleJob(expression, () => {})
      if (!testJob) {
        throw new Error('Expressão inválida')
      }
      testJob.cancel()
    } catch (error) {
      throw new Error(`Cron expression inválida: "${expression}"`)
    }
  }

  private calculateNextRun(expression: string): Date {
    // Criar um job temporário para obter a próxima execução
    const testJob = schedule.scheduleJob(expression, () => {})
    
    if (!testJob) {
      // Fallback: próxima hora
      const next = new Date()
      next.setHours(next.getHours() + 1, 0, 0, 0)
      return next
    }

    const nextRun = testJob.nextInvocation()
    testJob.cancel()
    
    if (!nextRun) {
      // Fallback: próxima hora
      const next = new Date()
      next.setHours(next.getHours() + 1, 0, 0, 0)
      return next
    }
    
    return nextRun
  }

  getNextExecutions(
    expression: string,
    count: number = 5
  ): Date[] {
    const executions: Date[] = []
    
    try {
      // O node-schedule não tem uma forma direta de obter múltiplas execuções
      // Vamos calcular manualmente baseado no primeiro next
      const testJob = schedule.scheduleJob(expression, () => {})
      
      if (!testJob) {
        return executions
      }

      const firstNext = testJob.nextInvocation()
      testJob.cancel()
      
      if (!firstNext) {
        return executions
      }

      // Adicionar a primeira execução
      executions.push(firstNext)
      
      // Para as próximas, vamos apenas adicionar intervalos estimados
      // (Isto é uma simplificação - o ideal seria usar cron-parser aqui,
      // mas para evitar problemas de import, fazemos uma aproximação)
      
      // Se for um cron simples (ex: "0 2 * * *"), podemos estimar
      // Por agora, retornamos apenas a próxima execução
      // TODO: Implementar cálculo de múltiplas execuções se necessário
      
    } catch (error) {
      console.error('Erro ao calcular próximas execuções:', error)
    }

    return executions
  }
}

// ─────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────

export const syncSchedulerService = new CronManagementService()

export default syncSchedulerService