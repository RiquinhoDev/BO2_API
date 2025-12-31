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

// ─────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DO JOB
// ─────────────────────────────────────────────────────────────

const JOB_NAME = 'ResetCounters'
const CRON_SCHEDULE = '0 1 * * 1' // 1h da manhã, toda segunda-feira

console.log('⚠️ ResetCounters: DESATIVADO hardcoded (gerido pelo wizard)')

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

    // ✅ CORREÇÃO: Query compatível com Mongoose Maps
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
          // ✅ Lidar com Map ou Object
          let coursesData: any
          
          if (user.communicationByCourse instanceof Map) {
            // É Map - usar Map methods
            coursesData = Array.from(user.communicationByCourse.entries())
          } else {
            // É Object - usar Object.entries
            coursesData = Object.entries(user.communicationByCourse)
          }
          
          for (const [courseId, courseData] of coursesData) {
            const data = courseData as any
            if (data?.courseSpecificData) {
              data.courseSpecificData.reportsOpenedLastWeek = 0
            }
          }
          
          // Salvar sem validação (por segurança durante migração)
          await user.save({ validateBeforeSave: false })
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
            // ✅ Lidar com Map ou Object
            let coursesData: any
            
            if (user.communicationByCourse instanceof Map) {
              coursesData = Array.from(user.communicationByCourse.entries())
            } else {
              coursesData = Object.entries(user.communicationByCourse)
            }
            
            for (const [courseId, courseData] of coursesData) {
              const data = courseData as any
              if (data?.courseSpecificData) {
                data.courseSpecificData.reportsOpenedLastMonth = 0
              }
            }
            
            // Salvar sem validação (por segurança durante migração)
            await user.save({ validateBeforeSave: false })
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

    // ✅ RETORNAR RESULTADO
    return {
      success: true,
      ...stats,
      actionsDeleted: deletedActions.deletedCount,
      duration: durationSeconds
    }

  } catch (error: any) {
    stats.errors++
    logJobError(JOB_NAME, error)
    
    // ✅ LANÇAR ERRO PARA CRON CAPTURAR
    throw new Error(`Erro no reset de contadores: ${error.message}`)
  }
}

// ─────────────────────────────────────────────────────────────
// EXECUÇÃO AUTOMÁTICA PELO WIZARD
// ─────────────────────────────────────────────────────────────

export async function executeResetCounters() {
  logger.info('🚀 Executando reset de contadores (via wizard)')
  return await executeJob()
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

export default {
  run: executeResetCounters  // ← Wizard chama isto automaticamente!
}