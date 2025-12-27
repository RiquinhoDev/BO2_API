// ════════════════════════════════════════════════════════════
// 📁 src/jobs/resetCounters.job.ts
// Job semanal: Reset de contadores semanais e mensais
// Horário: 1h da manhã de segunda-feira
// ════════════════════════════════════════════════════════════

import cron from 'node-cron'
import User from '../models/user'
import UserAction from '../models/UserAction'
import logger, { logJobStart, logJobEnd, logJobError } from '../utils/logger'

// ─────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DO JOB
// ─────────────────────────────────────────────────────────────

const JOB_NAME = 'ResetCounters'
const CRON_SCHEDULE = '0 1 * * 1' // 1h da manhã, toda segunda-feira

// Para testes: '*/10 * * * *' = a cada 10 minutos
// Para produção: '0 1 * * 1' = 1h de segunda

// ─────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL DO JOB
// ─────────────────────────────────────────────────────────────

async function executeJob() {
  logJobStart(JOB_NAME)
  
  const startTime = Date.now()
  const stats = {
    usersUpdated: 0,
    weeklyCountersReset: 0,
    monthlyCountersReset: 0,
    errors: 0
  }

  try {
    const now = new Date()
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const isFirstMondayOfMonth = now.getDate() <= 7

    // ═══════════════════════════════════════════════════════════
    // 1. RESET CONTADORES SEMANAIS (toda segunda)
    // ═══════════════════════════════════════════════════════════

    logger.info('🔄 Resetando contadores semanais...')

    // Nota: Estamos usando Map no schema, então precisamos buscar e atualizar manualmente
    const users = await User.find({
      communicationByCourse: { $exists: true }
    })

    for (const user of users) {
      try {
        if (user.communicationByCourse) {
          // Iterar sobre cada curso no Map
          for (const [courseId, courseData] of user.communicationByCourse.entries()) {
            if (courseData.courseSpecificData) {
              courseData.courseSpecificData.reportsOpenedLastWeek = 0
            }
          }
          
          await user.save()
          stats.weeklyCountersReset++
        }
      } catch (error: any) {
        stats.errors++
        logger.error(`❌ Erro ao resetar contador semanal do user ${user.email}:`, {
          userId: user.id.toString(),
          error: error.message
        })
      }
    }

    stats.usersUpdated = stats.weeklyCountersReset
    logger.info(`✅ Contadores semanais resetados: ${stats.weeklyCountersReset} users`)

    // ═══════════════════════════════════════════════════════════
    // 2. RESET CONTADORES MENSAIS (primeira segunda do mês)
    // ═══════════════════════════════════════════════════════════

    if (isFirstMondayOfMonth) {
      logger.info('📅 Primeira segunda do mês - resetando contadores mensais...')

      for (const user of users) {
        try {
          if (user.communicationByCourse) {
            for (const [courseId, courseData] of user.communicationByCourse.entries()) {
              if (courseData.courseSpecificData) {
                courseData.courseSpecificData.reportsOpenedLastMonth = 0
              }
            }
            
            await user.save()
            stats.monthlyCountersReset++
          }
        } catch (error: any) {
          stats.errors++
          logger.error(`❌ Erro ao resetar contador mensal do user ${user.email}:`, {
            userId: user.id.toString(),
            error: error.message
          })
        }
      }

      logger.info(`✅ Contadores mensais resetados: ${stats.monthlyCountersReset} users`)
    }

    // ═══════════════════════════════════════════════════════════
    // 3. LIMPAR ACTIONS ANTIGAS (opcional - manter 90 dias)
    // ═══════════════════════════════════════════════════════════

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 90) // 90 dias atrás

    const deletedActions = await UserAction.deleteMany({
      timestamp: { $lt: cutoffDate }
    })

    logger.info(`🗑️ Ações antigas deletadas: ${deletedActions.deletedCount}`)

    // ═══════════════════════════════════════════════════════════
    // 4. FINALIZAÇÃO
    // ═══════════════════════════════════════════════════════════

    const duration = Date.now() - startTime
    const durationSeconds = Math.round(duration / 1000)

    logger.info(`⏱️ Job completo em ${durationSeconds} segundos`)

    logJobEnd(JOB_NAME, {
      ...stats,
      actionsDeleted: deletedActions.deletedCount,
      durationMs: duration,
      durationSeconds
    })

  } catch (error: any) {
    stats.errors++
    logJobError(JOB_NAME, error)
    throw error
  }
}

// ─────────────────────────────────────────────────────────────
// SCHEDULER
// ─────────────────────────────────────────────────────────────

export function startResetCountersJob() {
  logger.info(`📅 Agendando job: ${JOB_NAME}`)
  logger.info(`⏰ Horário: ${CRON_SCHEDULE} (1h de segunda-feira)`)

  cron.schedule(CRON_SCHEDULE, async () => {
    logger.info('⏰ Trigger: Job ResetCounters iniciado pelo CRON')
    await executeJob()
  })

  logger.info(`✅ Job ${JOB_NAME} agendado com sucesso`)
}

// ─────────────────────────────────────────────────────────────
// EXECUÇÃO MANUAL (para testes)
// ─────────────────────────────────────────────────────────────

export async function runResetCountersNow() {
  logger.info('🚀 Execução manual do job ResetCounters')
  await executeJob()
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

export default {
  start: startResetCountersJob,
  runNow: runResetCountersNow
}

