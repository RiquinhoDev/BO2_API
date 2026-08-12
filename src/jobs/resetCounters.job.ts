// ════════════════════════════════════════════════════════════
// 📁 src/jobs/resetCounters.job.ts (CORRIGIDO)
// Job semanal: Reset de contadores semanais e mensais
// ════════════════════════════════════════════════════════════
//
// ⚠️ SCHEDULE DESATIVADO: Job migrado para wizard CRON
// Gestão: http://localhost:3000/activecampaign
//
// Horário original: 1h da manhã de segunda-feira
//
// ✅ CORREÇÃO: Query compatível com Mongoose Maps
//
// ════════════════════════════════════════════════════════════

import cron from 'node-cron'
import User from '../models/user'
import UserAction from '../models/UserAction'
import logger, { logJobStart, logJobEnd, logJobError } from '../utils/logger'

const JOB_NAME = 'ResetCounters'
const CRON_SCHEDULE = '0 1 * * 1'

interface CourseCounterState {
  courseSpecificData?: {
    reportsOpenedLastWeek?: number
    reportsOpenedLastMonth?: number
  }
}

function isCourseCounterState(value: unknown): value is CourseCounterState {
  if (!value || typeof value !== 'object') return false
  if (!('courseSpecificData' in value)) return true

  const courseSpecificData = value.courseSpecificData
  return courseSpecificData === undefined || (
    courseSpecificData !== null && typeof courseSpecificData === 'object'
  )
}

function communicationValues(value: unknown): CourseCounterState[] {
  const rawValues = value instanceof Map
    ? Array.from(value.values())
    : value && typeof value === 'object'
      ? Object.values(value)
      : []

  return rawValues.filter(isCourseCounterState)
}

logger.info('⚠️ ResetCounters: DESATIVADO hardcoded (gerido pelo wizard)')
logger.info(`   Schedule original: ${CRON_SCHEDULE}`)

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
    const isFirstMondayOfMonth = now.getDate() <= 7

    logger.info('🔄 Resetando contadores semanais...')

    const users = await User.find({
      $or: [
        { 'communicationByCourse.OGI': { $exists: true } },
        { 'communicationByCourse.CLAREZA': { $exists: true } },
        { 'communicationByCourse.OUTRO': { $exists: true } }
      ]
    })

    logger.info(`📊 Users encontrados: ${users.length}`)

    for (const user of users) {
      try {
        if (user.communicationByCourse) {
          for (const data of communicationValues(user.communicationByCourse)) {
            if (data.courseSpecificData) {
              data.courseSpecificData.reportsOpenedLastWeek = 0
            }
          }

          await user.save({ validateBeforeSave: false })
          stats.weeklyCountersReset++
        }
      } catch (error: unknown) {
        stats.errors++
        logger.error(`❌ Erro ao resetar contador semanal do user ${user.email}:`, {
          userId: user.id.toString(),
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    stats.usersUpdated = stats.weeklyCountersReset
    logger.info(`✅ Contadores semanais resetados: ${stats.weeklyCountersReset} users`)

    if (isFirstMondayOfMonth) {
      logger.info('📅 Primeira segunda do mês - resetando contadores mensais...')

      for (const user of users) {
        try {
          if (user.communicationByCourse) {
            for (const data of communicationValues(user.communicationByCourse)) {
              if (data.courseSpecificData) {
                data.courseSpecificData.reportsOpenedLastMonth = 0
              }
            }

            await user.save({ validateBeforeSave: false })
            stats.monthlyCountersReset++
          }
        } catch (error: unknown) {
          stats.errors++
          logger.error(`❌ Erro ao resetar contador mensal do user ${user.email}:`, {
            userId: user.id.toString(),
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      logger.info(`✅ Contadores mensais resetados: ${stats.monthlyCountersReset} users`)
    }

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 90)

    const deletedActions = await UserAction.deleteMany({
      timestamp: { $lt: cutoffDate }
    })

    logger.info(`🗑️ Ações antigas deletadas: ${deletedActions.deletedCount}`)

    const duration = Date.now() - startTime
    const durationSeconds = Math.round(duration / 1000)

    logger.info(`⏱️ Job completo em ${durationSeconds} segundos`)

    logJobEnd(JOB_NAME, {
      ...stats,
      actionsDeleted: deletedActions.deletedCount,
      durationMs: duration,
      durationSeconds
    })

    return {
      success: true,
      ...stats,
      actionsDeleted: deletedActions.deletedCount,
      duration: durationSeconds
    }
  } catch (error: unknown) {
    stats.errors++
    logJobError(JOB_NAME, error)
    throw new Error(`Erro no reset de contadores: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function executeResetCounters() {
  logger.info('🚀 Executando reset de contadores (via wizard)')
  return await executeJob()
}

export default {
  run: executeResetCounters
}
