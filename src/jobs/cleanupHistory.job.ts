// =====================================================
// 📁 src/jobs/cleanupHistory.job.ts
// CRON JOB: Limpeza Semanal de Histórico Antigo
// =====================================================
//
// ⚠️ SCHEDULE DESATIVADO: Job migrado para wizard CRON
// Gestão: http://localhost:3000/activecampaign
//
// =====================================================

import cron from 'node-cron'
import CommunicationHistory from '../models/acTags/CommunicationHistory'
import CronExecutionLog from '../models/CronExecutionLog'

// Configuração: quantos dias manter (180 = 6 meses)
const DAYS_TO_KEEP = parseInt(process.env.HISTORY_RETENTION_DAYS || '180')

console.log('⚠️ CleanupHistory: DESATIVADO (migrado para wizard CRON)')
console.log(`   Retenção configurada: ${DAYS_TO_KEEP} dias`)

// 🧪 Exportar função para testes/execução manual
export async function runCleanupManually(dryRun = false) {
  console.log('🧪 Executando limpeza manual...')
  
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - DAYS_TO_KEEP)

  try {
    const totalBefore = await CommunicationHistory.countDocuments()
    const toDelete = await CommunicationHistory.countDocuments({
      createdAt: { $lt: cutoffDate }
    })

    console.log(`📊 Total de registos: ${totalBefore}`)
    console.log(`🗑️  Registos a remover: ${toDelete}`)
    console.log(`📅 Data limite: ${cutoffDate.toISOString()}`)

    if (dryRun) {
      console.log('🔍 DRY RUN - Nenhum registo foi removido')
      return {
        success: true,
        dryRun: true,
        wouldDelete: toDelete,
        totalBefore,
      }
    }

    const result = await CommunicationHistory.deleteMany({
      createdAt: { $lt: cutoffDate }
    })

    const totalAfter = await CommunicationHistory.countDocuments()

    console.log(`✅ ${result.deletedCount} registos removidos`)
    console.log(`📊 Registos restantes: ${totalAfter}`)

    return {
      success: true,
      deleted: result.deletedCount,
      totalBefore,
      totalAfter,
    }
  } catch (error: any) {
    console.error('❌ Erro na limpeza manual:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

export default {
  run: runCleanupManually
}