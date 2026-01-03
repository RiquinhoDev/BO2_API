// ================================================================
// ⚙️ CRON MANAGEMENT SERVICE
// ================================================================
// Serviço para gestão de jobs CRON (agendamento, execução, histórico)
// ================================================================

import CronConfig from '../models/cron/CronConfig'
import CronExecution from '../models/cron/CronExecution'
import Course from '../models/Course'
import User from '../models/user'
import tagRuleEngine from './ac/tagRuleEngine'
import ProductProfile from '../models/product/ProductProfile'
import decisionEngine from './ac/decisionEngine.service'
import tagOrchestrator from './ac/tagOrchestrator.service'
import schedule from 'node-schedule'

type CronConfigLike = {
  name: string
  cronExpression: string
  isActive: boolean
}

type Decision = {
  shouldExecute: boolean
  action?: string
  reason?: string
  [key: string]: unknown
}

type DecisionEngineLike = {
  evaluateStudent: (userId: unknown, productCode: string) => Promise<Decision>
}

type OrchestratorResult = {
  success: boolean
  error?: string
  [key: string]: unknown
}

type TagOrchestratorLike = {
  executeDecision: (userId: unknown, productCode: string, decision: Decision) => Promise<OrchestratorResult>
}

// Type guards (para compatibilidade entre versões/types do node-schedule)
type HasToDate = { toDate: () => Date }
const hasToDate = (v: unknown): v is HasToDate => {
  if (typeof v !== 'object' || v === null) return false
  const maybe = v as { toDate?: unknown }
  return typeof maybe.toDate === 'function'
}

const normalizeNextRunDate = (v: unknown): Date | null => {
  if (!v) return null
  if (v instanceof Date) return v
  if (hasToDate(v)) return v.toDate()
  return null
}

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
        await this.scheduleCronJob(config as unknown as CronConfigLike)
        console.log(`✅ CRON job iniciado: ${config.cronExpression}`)
      } else {
        console.log('⏸️ CRON job está pausado')
      }
    } catch (error: unknown) {
      console.error('❌ Erro ao inicializar cron jobs:', error)
      throw error
    }
  }

  /**
   * Agenda um cron job específico
   */
  private async scheduleCronJob(config: CronConfigLike): Promise<void> {
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
    const nextRunRaw: unknown = job.nextInvocation() as unknown
    const nextRunDate = normalizeNextRunDate(nextRunRaw)

    await CronConfig.findOneAndUpdate({ name }, { nextRun: nextRunDate })

    console.log(`📅 CRON '${name}' agendado: ${cronExpression}`)
    if (nextRunDate) {
      console.log(`⏰ Próxima execução: ${nextRunDate.toISOString()}`)
    }
  }

  /**
   * 🆕 SISTEMA INTELIGENTE: Executa sincronização usando ProductProfiles + DecisionEngine
   */
  async executeIntelligentTagSync(
    type: 'automatic' | 'manual',
    userId?: string
  ): Promise<any> {
    console.log(`🚀 Iniciando sincronização INTELIGENTE (${type})...`)
    const startTime = Date.now()

    const execution = await CronExecution.create({
      cronName: 'INTELLIGENT_TAG_SYNC',
      executionType: type,
      status: 'running',
      startTime: new Date(),
      executedBy: userId,
    })

    // casts mínimos para evitar erro de TS quando os types exportados não expõem os métodos
    const decisionEngineSafe = decisionEngine as unknown as DecisionEngineLike
    const tagOrchestratorSafe = tagOrchestrator as unknown as TagOrchestratorLike

    try {
      // ===== 1. BUSCAR PRODUCT PROFILES ATIVOS =====
      const profiles = await ProductProfile.find({ isActive: true })
      console.log(`📚 ${profiles.length} perfis de produto ativos encontrados`)

      if (profiles.length === 0) {
        console.warn('⚠️ Nenhum perfil de produto ativo encontrado!')
        execution.status = 'success'
        execution.endTime = new Date()
        execution.duration = Date.now() - startTime
        execution.tagsApplied = 0
        execution.studentsProcessed = 0
        await execution.save()

        return {
          success: true,
          executionId: execution._id,
          summary: {
            duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
            profilesProcessed: 0,
            decisionsAnalyzed: 0,
            actionsExecuted: 0,
            message: 'Nenhum perfil ativo',
          },
        }
      }

      let totalDecisions = 0
      let totalExecuted = 0
      const results: any[] = []

      // ===== 2. PARA CADA PRODUTO =====
      for (const profile of profiles) {
        console.log(`\n🎓 Processando produto: ${profile.name} (${profile.code})`)

        // Buscar alunos que têm dados deste produto
        const users = await User.find({
          [`communicationByCourse.${profile.code}`]: { $exists: true },
        })

        console.log(`   👥 ${users.length} alunos encontrados`)

        let productDecisions = 0
        let productExecuted = 0
        const productResults: any[] = []

        // ===== 3. PARA CADA ALUNO, USAR DECISION ENGINE =====
        for (const user of users) {
          try {
            // Avaliar decisão
            const decision = await decisionEngineSafe.evaluateStudent(user._id, profile.code)
            totalDecisions++
            productDecisions++

            if (decision.shouldExecute) {
              // Executar decisão
              const result = await tagOrchestratorSafe.executeDecision(user._id, profile.code, decision)

              if (result.success) {
                totalExecuted++
                productExecuted++
                console.log(`   ✅ ${user.email}: ${decision.action} - ${decision.reason}`)
              } else {
                console.log(`   ❌ ${user.email}: Falha - ${result.error}`)
              }

              productResults.push({
                email: user.email,
                decision,
                result,
                success: result.success,
              })
            } else {
              console.log(`   ⏭️ ${user.email}: ${decision.reason}`)
            }
          } catch (error: unknown) {
            const e = error as { message?: unknown }
            const msg = typeof e.message === 'string' ? e.message : 'Erro desconhecido'
            console.error(`   💥 Erro ao processar ${user.email}:`, msg)
          }
        }

        results.push({
          productCode: profile.code,
          productName: profile.name,
          studentsAnalyzed: users.length,
          decisionsConsidered: productDecisions,
          actionsExecuted: productExecuted,
          successRate:
            productDecisions > 0 ? `${((productExecuted / productDecisions) * 100).toFixed(1)}%` : '0%',
          topActions: this.summarizeActions(productResults),
        })
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      // ===== 4. SALVAR RESULTADO DA EXECUÇÃO =====
      execution.status = 'success'
      execution.endTime = new Date()
      execution.duration = duration
      execution.tagsApplied = totalExecuted
      execution.studentsProcessed = totalDecisions
      execution.emailsSynced = totalDecisions
      await execution.save()

      // Atualizar config com última execução
      const config = await CronConfig.findOne({ name: 'TAG_RULES_SYNC' })
      if (config) {
        const newAvg = config.averageDuration
          ? Math.round(config.averageDuration * 0.7 + duration * 0.3)
          : duration

        await CronConfig.findOneAndUpdate(
          { name: 'TAG_RULES_SYNC' },
          {
            lastRun: new Date(),
            averageDuration: newAvg,
          }
        )
      }

      console.log(`\n🎉 Sincronização concluída em ${(duration / 1000).toFixed(1)}s`)
      console.log(`📊 Resumo: ${totalDecisions} decisões → ${totalExecuted} ações executadas`)

      return {
        success: true,
        executionId: execution._id,
        summary: {
          duration: `${(duration / 1000).toFixed(1)}s`,
          profilesProcessed: profiles.length,
          decisionsAnalyzed: totalDecisions,
          actionsExecuted: totalExecuted,
          successRate: totalDecisions > 0 ? `${((totalExecuted / totalDecisions) * 100).toFixed(1)}%` : '0%',
        },
        detailsByProduct: results,
      }
    } catch (error: unknown) {
      console.error('❌ Erro na sincronização inteligente:', error)

      const e = error as { message?: unknown }
      const msg = typeof e.message === 'string' ? e.message : 'Erro desconhecido'

      execution.status = 'error'
      execution.endTime = new Date()
      execution.duration = Date.now() - startTime
      execution.errorMessage = msg
      await execution.save()

      return {
        success: false,
        executionId: execution._id,
        error: msg,
      }
    }
  }

  /**
   * Resumir ações executadas para estatísticas
   */
  private summarizeActions(results: any[]): any {
    const summary: any = {}
    results.forEach((r) => {
      if (r.decision?.action) {
        summary[r.decision.action] = (summary[r.decision.action] || 0) + 1
      }
    })
    return summary
  }

  /**
   * ⚠️ LEGADO: Executa sincronização de tags (automático ou manual)
   * @deprecated Use executeIntelligentTagSync() para o novo sistema
   */
  async executeTagRulesSync(type: 'automatic' | 'manual', userId?: string): Promise<any> {
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
          [`communicationByCourse.${course.code}`]: { $exists: true },
        })

        console.log(`   👥 ${users.length} alunos encontrados`)

        // Avaliar regras para cada user
        for (const user of users) {
          try {
            const results = await tagRuleEngine.evaluateUserRules(user.id, course._id)

            // Contar tags aplicadas
            const executedRules = results.filter((r: any) => r.executed)
            totalTagsApplied += executedRules.length

            // Adicionar user ao set (para contar únicos)
            processedUserIds.add(user.id.toString())
          } catch (userError: unknown) {
            const e = userError as { message?: unknown }
            const msg = typeof e.message === 'string' ? e.message : 'Erro desconhecido'
            console.error(`   ❌ Erro ao processar ${user.email}:`, msg)
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
          ? Math.round(config.averageDuration * 0.7 + duration * 0.3)
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
    } catch (error: unknown) {
      console.error('❌ Erro na sincronização:', error)

      const e = error as { message?: unknown }
      const msg = typeof e.message === 'string' ? e.message : 'Erro desconhecido'

      // Atualiza execução com erro
      execution.status = 'error'
      execution.endTime = new Date()
      execution.duration = Date.now() - startTime
      execution.errorMessage = msg
      await execution.save()

      return {
        success: false,
        execution: execution.toObject(),
        error: msg,
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

      const config = await CronConfig.findOneAndUpdate({ name }, updates, { new: true, upsert: true })

      // Re-agenda o job se estiver ativo
      if (config && config.isActive) {
        await this.scheduleCronJob(config as unknown as CronConfigLike)
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
    } catch (error: unknown) {
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
    const successful = executions.filter((e: any) => e.status === 'success').length
    const failed = executions.filter((e: any) => e.status === 'error').length
    const totalTags = executions.reduce((sum: number, e: any) => sum + (e.tagsApplied || 0), 0)
    const totalStudents = executions.reduce((sum: number, e: any) => sum + (e.studentsProcessed || 0), 0)
    const avgDuration =
      executions
        .filter((e: any) => e.duration)
        .reduce((sum: number, e: any) => sum + (e.duration || 0), 0) / total || 0

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
