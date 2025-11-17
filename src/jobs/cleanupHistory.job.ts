// =====================================================
// 📁 src/jobs/cleanupHistory.job.ts
// CRON JOB: Limpeza Semanal de Histórico Antigo
// =====================================================

import cron from 'node-cron'
import CommunicationHistory from '../models/CommunicationHistory'
import CronExecutionLog from '../models/CronExecutionLog'

/**
 * CRON Job de Limpeza - Histórico Antigo
 * 
 * Horário: Toda segunda-feira às 3h da manhã (0 3 * * 1)
 * 
 * Função:
 * 1. Remove comunicações com mais de 180 dias (6 meses)
 * 2. Mantém BD leve e performante
 * 3. Regista estatísticas de limpeza
 */

// Configuração: quantos dias manter (180 = 6 meses)
const DAYS_TO_KEEP = parseInt(process.env.HISTORY_RETENTION_DAYS || '180')

// 🕐 Configurar CRON: Toda segunda-feira às 3h da manhã
cron.schedule('0 3 * * 1', async () => {
  const executionId = `CLEANUP_${Date.now()}`
  const startedAt = new Date()
  
  console.log(`\n${'='.repeat(70)}`)
  console.log(`🧹 [${executionId}] LIMPEZA SEMANAL DE HISTÓRICO INICIADA`)
  console.log(`📅 Data: ${startedAt.toISOString()}`)
  console.log(`🗑️  Mantendo últimos ${DAYS_TO_KEEP} dias`)
  console.log(`${'='.repeat(70)}\n`)

  const results = {
    recordsDeleted: 0,
    errors: [] as any[],
  }

  try {
    // Calcular data limite (ex: 180 dias atrás)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - DAYS_TO_KEEP)

    console.log(`📆 Data limite: ${cutoffDate.toISOString()}`)
    console.log(`   Tudo antes desta data será removido\n`)

    // Contar registos antes da limpeza
    const totalBefore = await CommunicationHistory.countDocuments()
    console.log(`📊 Total de registos antes: ${totalBefore}`)

    // Executar limpeza
    const deleteResult = await CommunicationHistory.deleteMany({
      createdAt: { $lt: cutoffDate }
    })

    results.recordsDeleted = deleteResult.deletedCount || 0

    // Contar registos após limpeza
    const totalAfter = await CommunicationHistory.countDocuments()
    console.log(`📊 Total de registos após: ${totalAfter}`)

    // Relatório
    const finishedAt = new Date()
    const duration = finishedAt.getTime() - startedAt.getTime()

    console.log(`\n${'='.repeat(70)}`)
    console.log(`📊 RELATÓRIO DE LIMPEZA - ${executionId}`)
    console.log(`${'='.repeat(70)}`)
    console.log(`✅ Registos removidos: ${results.recordsDeleted}`)
    console.log(`📊 Registos restantes: ${totalAfter}`)
    console.log(`💾 Espaço liberado: ~${(results.recordsDeleted * 0.5).toFixed(2)}KB (estimado)`)
    console.log(`⏱️  Tempo total: ${(duration / 1000).toFixed(2)}s`)
    console.log(`${'='.repeat(70)}\n`)

    // Salvar log
    await CronExecutionLog.create({
      executionId,
      type: 'weekly-cleanup',
      startedAt,
      finishedAt,
      duration,
      results: {
        recordsDeleted: results.recordsDeleted,
        totalBefore,
        totalAfter,
        cutoffDate,
        errors: [],
      },
      status: 'success',
    })

    console.log(`💾 Log de limpeza salvo: ${executionId}\n`)

  } catch (error: any) {
    console.error(`\n❌ [${executionId}] ERRO NA LIMPEZA:`, error)
    results.errors.push({
      type: 'cleanup-error',
      error: error.message,
      stack: error.stack,
    })

    const finishedAt = new Date()
    const duration = finishedAt.getTime() - startedAt.getTime()

    await CronExecutionLog.create({
      executionId,
      type: 'weekly-cleanup',
      startedAt,
      finishedAt,
      duration,
      results,
      status: 'failed',
    })
  }
})

// 🚀 Mensagem de inicialização
console.log('✅ CRON Job de limpeza semanal configurado (segunda-feira às 3h)')
console.log(`   Retenção: ${DAYS_TO_KEEP} dias`)

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



