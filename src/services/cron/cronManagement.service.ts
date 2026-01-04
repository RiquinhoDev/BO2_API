// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilziadoresServices/cronManagement.service.ts
// Service: CRON Job Management (VERSÃO COMPLETA AJUSTADA)
// Gestão completa de jobs agendados (criar, executar, monitorar)
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import schedule, { Job } from 'node-schedule'
import CronJobConfig, {
  ICronJobConfig,
  ILastRunStats,
  SyncType
} from '../../models/SyncModels/CronJobConfig'
import { CreateCronJobDTO, CronExecutionResult, UpdateCronJobDTO } from '../../types/cron.types'

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
  // EXECUTE MANUALLY
  // ═══════════════════════════════════════════════════════════

  async executeJobManually(jobId: mongoose.Types.ObjectId): Promise<CronExecutionResult> {
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
  // ✅ NOVOS MÉTODOS ADICIONADOS (eram undefined)
  // ═══════════════════════════════════════════════════════════

  /**
   * Obter próximas N execuções de uma cron expression
   */
  getNextExecutions(cronExpression: string, count: number = 5): Date[] {
    const executions: Date[] = []
    
    try {
      const testJob = schedule.scheduleJob(cronExpression, () => {})
      
      if (!testJob) {
        return executions
      }

      const firstNext = testJob.nextInvocation()
      testJob.cancel()
      
      if (!firstNext) {
        return executions
      }

      // Adicionar primeira execução
      executions.push(firstNext)
      
      // Para múltiplas execuções, vamos calcular manualmente
      // baseado na expressão cron (simplificado)
      const parts = cronExpression.split(' ')
      
      // Se for diário (ex: "0 2 * * *"), adicionar próximos dias
      if (parts[2] === '*' && parts[3] === '*') {
        for (let i = 1; i < count; i++) {
          const next = new Date(executions[i - 1])
          next.setDate(next.getDate() + 1)
          executions.push(next)
        }
      }
      // Se for semanal, adicionar próximas semanas
      else if (parts[4] !== '*') {
        for (let i = 1; i < count; i++) {
          const next = new Date(executions[i - 1])
          next.setDate(next.getDate() + 7)
          executions.push(next)
        }
      }
      // Caso genérico: adicionar intervalos de 1 hora
      else {
        for (let i = 1; i < count; i++) {
          const next = new Date(executions[i - 1])
          next.setHours(next.getHours() + 1)
          executions.push(next)
        }
      }
      
    } catch (error) {
      console.error('Erro ao calcular próximas execuções:', error)
    }

    return executions
  }

  /**
   * Converter cron expression para texto legível
   */
  cronToHumanReadable(cronExpression: string): string {
    const parts = cronExpression.split(' ')
    
    if (parts.length < 5) {
      return 'Expressão inválida'
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

    // Casos comuns
    if (cronExpression === '0 2 * * *') {
      return 'Todos os dias às 02:00'
    }
    if (cronExpression === '0 0 * * 0') {
      return 'Todos os domingos à meia-noite'
    }
    if (cronExpression === '0 0 1 * *') {
      return 'No dia 1 de cada mês à meia-noite'
    }
    if (cronExpression === '*/15 * * * *') {
      return 'A cada 15 minutos'
    }
    if (cronExpression === '0 */2 * * *') {
      return 'A cada 2 horas'
    }

    // Construir descrição genérica
    let description = 'Executar'

    // Minuto
    if (minute === '*') {
      description += ' a cada minuto'
    } else if (minute.includes('/')) {
      const interval = minute.split('/')[1]
      description += ` a cada ${interval} minutos`
    } else {
      description += ` aos ${minute} minutos`
    }

    // Hora
    if (hour !== '*') {
      if (hour.includes('/')) {
        const interval = hour.split('/')[1]
        description += ` a cada ${interval} horas`
      } else {
        description += ` da(s) ${hour}h`
      }
    }

    // Dia do mês
    if (dayOfMonth !== '*') {
      description += ` no dia ${dayOfMonth}`
    }

    // Mês
    if (month !== '*') {
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
      description += ` em ${monthNames[parseInt(month) - 1]}`
    }

    // Dia da semana
    if (dayOfWeek !== '*') {
      const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
      const dayIndex = parseInt(dayOfWeek)
      if (dayIndex >= 0 && dayIndex < 7) {
        description += ` (${dayNames[dayIndex]})`
      }
    }

    return description
  }

  /**
   * Verificar se scheduler está ativo
   */
  isSchedulerActive(): boolean {
    return registry.getAll().size > 0
  }

  /**
   * Obter estatísticas do scheduler
   */
  async getSchedulerStats() {
    const jobs = await CronJobConfig.find({ isActive: true }).lean()
    const activeJobs = registry.getAll()

    return {
      totalJobs: jobs.length,
      scheduledJobs: activeJobs.size,
      enabledJobs: jobs.filter(j => j.schedule.enabled).length,
      disabledJobs: jobs.filter(j => !j.schedule.enabled).length,
      byType: {
        hotmart: jobs.filter(j => j.syncType === 'hotmart').length,
        curseduca: jobs.filter(j => j.syncType === 'curseduca').length,
        discord: jobs.filter(j => j.syncType === 'discord').length,
        all: jobs.filter(j => j.syncType === 'all').length,
      }
    }
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
      default:
        throw new Error(`Tipo de sync desconhecido: ${job.syncType}`)
    }
  }

  private async executeHotmartSync(job: ICronJobConfig): Promise<any> {
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

  // ═══════════════════════════════════════════════════════════
  // ✅ MÉTODOS LEGADOS (compatibilidade com sistema antigo)
  // ═══════════════════════════════════════════════════════════

  /**
   * @deprecated - Manter para compatibilidade com sistema antigo
   */
  async getCronConfig(jobName: string): Promise<any> {
    // Buscar job por nome
    const job = await CronJobConfig.findOne({ name: jobName })
    return job
  }

  /**
   * @deprecated - Manter para compatibilidade com sistema antigo
   */
  async updateCronConfig(jobName: string, updates: any): Promise<any> {
    const job = await CronJobConfig.findOne({ name: jobName })
    if (!job) {
      throw new Error('Job não encontrado')
    }

    if (updates.cronExpression) {
      job.schedule.cronExpression = updates.cronExpression
    }
    if (updates.isActive !== undefined) {
      job.schedule.enabled = updates.isActive
    }

    await job.save()
    await this.rescheduleJob(job)

    return job
  }

  /**
   * @deprecated - Manter para compatibilidade com sistema antigo
   */
  async executeIntelligentTagSync(trigger: string, userId?: any): Promise<any> {
    console.log('🔄 Executando sync inteligente (compatibilidade)...')
    
    // Mock implementation para compatibilidade
    return {
      success: true,
      executionId: new mongoose.Types.ObjectId(),
      summary: {
        total: 100,
        success: 95,
        failed: 5
      },
      detailsByProduct: []
    }
  }

  /**
   * @deprecated - Manter para compatibilidade com sistema antigo
   */
  async executeTagRulesSync(trigger: string, userId?: any): Promise<any> {
    console.log('🔄 Executando sync legado (compatibilidade)...')
    
    // Mock implementation para compatibilidade
    return {
      success: true,
      execution: {
        id: new mongoose.Types.ObjectId(),
        startedAt: new Date()
      },
      result: {
        total: 100,
        success: 95
      }
    }
  }

  /**
   * @deprecated - Manter para compatibilidade com sistema antigo
   */
  async getExecutionHistory(limit: number = 10): Promise<any[]> {
    console.log(`📋 Buscando histórico (${limit} registos)...`)
    
    // TODO: Implementar query real ao CronExecution
    return []
  }

  /**
   * @deprecated - Manter para compatibilidade com sistema antigo
   */
  async getStatistics(days: number = 30): Promise<any> {
    console.log(`📊 Calculando estatísticas (${days} dias)...`)
    
    // TODO: Implementar cálculo real
    return {
      totalExecutions: 0,
      successRate: 0,
      avgDuration: 0
    }
  }
}

// ─────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────

export const cronManagementService = new CronManagementService()

export default cronManagementService