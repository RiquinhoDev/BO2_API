// ================================================================
// ⚙️ CRON MANAGEMENT SERVICE
// ================================================================
// Serviço para gestão de jobs CRON (agendamento, execução, histórico)
// ================================================================

import CronConfig from '../models/CronConfig'
import CronExecution from '../models/CronExecution'
import Course from '../models/Course'
import User from '../models/user'
import tagRuleEngine from './tagRuleEngine'
import schedule from 'node-schedule'

class CronManagementService {
  private scheduledJobs: Map<string, schedule.Job> = new Map()

  /**
   * Inicializa todos os cron jobs ativos
   */
  async initializeCronJobs(): Promise<void> {
    try {
      console.log('🕐 Inicializando CRON jobs...')

      // Buscar ou criar configuração padrão
      let config = await CronConfig.findOne({ name: 'TAG_RULES_SYNC' })
      
      if (!config) {
        console.log('📝 Criando configuração padrão de CRON...')
        config = await CronConfig.create({
          name: 'TAG_RULES_SYNC',
          cronExpression: '0 2 * * *', // 2h da manhã
          isActive: true,
        })
      }

      if (config.isActive) {
        await this.scheduleCronJob(config)
        console.log(`✅ CRON job iniciado: ${config.cronExpression}`)
      } else {
        console.log('⏸️ CRON job está pausado')
      }
    } catch (error) {
      console.error('❌ Erro ao inicializar cron jobs:', error)
      throw error
    }
  }

  /**
   * Agenda um cron job específico
   */
  private async scheduleCronJob(config: any): Promise<void> {
    const { name, cronExpression } = config

    // Cancela job existente se houver
    const existingJob = this.scheduledJobs.get(name)
    if (existingJob) {
      existingJob.cancel()
      console.log(`🔄 Job existente '${name}' cancelado`)
    }

    // Cria novo job
    const job = schedule.scheduleJob(cronExpression, async () => {
      console.log(`🕐 CRON automático disparado: ${new Date().toISOString()}`)
      await this.executeTagRulesSync('automatic')
    })

    this.scheduledJobs.set(name, job)

    // Atualiza próxima execução
    const nextRun = job.nextInvocation()
    await CronConfig.findOneAndUpdate(
      { name },
      { nextRun: nextRun ? nextRun.toDate() : null }
    )

    console.log(`📅 CRON '${name}' agendado: ${cronExpression}`)
    if (nextRun) {
      console.log(`⏰ Próxima execução: ${nextRun.toDate().toISOString()}`)
    }
  }

  /**
   * Executa sincronização de tags (automático ou manual)
   */
  async executeTagRulesSync(
    type: 'automatic' | 'manual',
    userId?: string
  ): Promise<any> {
    console.log(`🚀 Iniciando sincronização (${type})...`)
    const startTime = Date.now()

    const execution = await CronExecution.create({
      cronName: 'TAG_RULES_SYNC',
      executionType: type,
      status: 'running',
      startTime: new Date(),
      executedBy: userId,
    })

    try {
      // Buscar cursos ativos
      const courses = await Course.find({ isActive: true })
      console.log(`📚 Processando ${courses.length} cursos ativos`)

      let totalTagsApplied = 0
      let totalStudentsProcessed = 0
      const processedUserIds = new Set<string>()

      // Para cada curso
      for (const course of courses) {
        console.log(`🎓 Processando curso: ${course.name} (${course.code})`)

        // Buscar users que têm dados deste curso
        const users = await User.find({
          [`communicationByCourse.${course.code}`]: { $exists: true }
        })

        console.log(`   👥 ${users.length} alunos encontrados`)

        // Avaliar regras para cada user
        for (const user of users) {
          try {
            const results = await tagRuleEngine.evaluateUserRules(user._id, course._id)

            // Contar tags aplicadas
            const executedRules = results.filter(r => r.executed)
            totalTagsApplied += executedRules.length

            // Adicionar user ao set (para contar únicos)
            processedUserIds.add(user._id.toString())

          } catch (userError: any) {
            console.error(`   ❌ Erro ao processar ${user.email}:`, userError.message)
          }
        }
      }

      totalStudentsProcessed = processedUserIds.size

      const endTime = Date.now()
      const duration = endTime - startTime

      // Atualiza execução com sucesso
      execution.status = 'success'
      execution.endTime = new Date()
      execution.duration = duration
      execution.tagsApplied = totalTagsApplied
      execution.studentsProcessed = totalStudentsProcessed
      execution.emailsSynced = totalStudentsProcessed
      await execution.save()

      // Atualiza config com última execução e duração média
      const config = await CronConfig.findOne({ name: 'TAG_RULES_SYNC' })
      if (config) {
        // Calcular média móvel da duração
        const newAvg = config.averageDuration
          ? Math.round((config.averageDuration * 0.7) + (duration * 0.3))
          : duration

        await CronConfig.findOneAndUpdate(
          { name: 'TAG_RULES_SYNC' },
          {
            lastRun: new Date(),
            averageDuration: newAvg,
          }
        )
      }

      console.log(`✅ Sincronização concluída (${(duration / 1000).toFixed(2)}s):`)
      console.log(`   • ${totalTagsApplied} tags aplicadas`)
      console.log(`   • ${totalStudentsProcessed} alunos processados`)
      console.log(`   • ${courses.length} cursos verificados`)

      return {
        success: true,
        execution: execution.toObject(),
        result: {
          tagsApplied: totalTagsApplied,
          studentsSynced: totalStudentsProcessed,
          coursesProcessed: courses.length,
          duration,
        },
      }
    } catch (error: any) {
      console.error('❌ Erro na sincronização:', error)

      // Atualiza execução com erro
      execution.status = 'error'
      execution.endTime = new Date()
      execution.duration = Date.now() - startTime
      execution.errorMessage = error.message
      await execution.save()

      return {
        success: false,
        execution: execution.toObject(),
        error: error.message,
      }
    }
  }

  /**
   * Atualiza configuração de cron
   */
  async updateCronConfig(
    name: string,
    updates: { cronExpression?: string; isActive?: boolean }
  ): Promise<any> {
    try {
      console.log(`⚙️ Atualizando configuração '${name}':`, updates)

      const config = await CronConfig.findOneAndUpdate(
        { name },
        updates,
        { new: true, upsert: true }
      )

      // Re-agenda o job se estiver ativo
      if (config && config.isActive) {
        await this.scheduleCronJob(config)
        console.log(`✅ Job '${name}' reagendado`)
      } else if (config && !config.isActive) {
        // Cancela o job se foi desativado
        const job = this.scheduledJobs.get(name)
        if (job) {
          job.cancel()
          this.scheduledJobs.delete(name)
          console.log(`⏸️ Job '${name}' pausado`)
        }
      }

      return config
    } catch (error) {
      console.error('❌ Erro ao atualizar config:', error)
      throw error
    }
  }

  /**
   * Obtém configuração atual
   */
  async getCronConfig(name: string): Promise<any> {
    return await CronConfig.findOne({ name })
  }

  /**
   * Obtém histórico de execuções
   */
  async getExecutionHistory(limit: number = 10): Promise<any[]> {
    return await CronExecution.find()
      .sort({ startTime: -1 })
      .limit(limit)
      .populate('executedBy', 'name email')
  }

  /**
   * Obtém estatísticas
   */
  async getStatistics(days: number = 30): Promise<any> {
    const since = new Date()
    since.setDate(since.getDate() - days)

    const executions = await CronExecution.find({
      startTime: { $gte: since },
    })

    const total = executions.length
    const successful = executions.filter((e) => e.status === 'success').length
    const failed = executions.filter((e) => e.status === 'error').length
    const totalTags = executions.reduce((sum, e) => sum + (e.tagsApplied || 0), 0)
    const totalStudents = executions.reduce((sum, e) => sum + (e.studentsProcessed || 0), 0)
    const avgDuration =
      executions
        .filter((e) => e.duration)
        .reduce((sum, e) => sum + (e.duration || 0), 0) / total || 0

    return {
      totalExecutions: total,
      successfulExecutions: successful,
      failedExecutions: failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(1) : '0',
      totalTagsApplied: totalTags,
      totalStudentsProcessed: totalStudents,
      averageDuration: Math.round(avgDuration),
      period: `${days} dias`,
    }
  }
}

export default new CronManagementService()

