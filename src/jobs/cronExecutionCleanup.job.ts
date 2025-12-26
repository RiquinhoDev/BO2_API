// ════════════════════════════════════════════════════════════
// 🧹 CRON EXECUTION CLEANUP JOB
// ════════════════════════════════════════════════════════════
// Limpa registos de execuções antigas (>90 dias) para manter BD limpa
// Executa: Todos os domingos às 03:00
// ════════════════════════════════════════════════════════════

import schedule from 'node-schedule'
import CronExecution from '../models/CronExecution'

// ─────────────────────────────────────────────────────────────
// CONFIGURAÇÕES
// ─────────────────────────────────────────────────────────────

const RETENTION_DAYS = 90 // Manter últimos 90 dias
const CRON_SCHEDULE = '0 3 * * 0' // Domingos às 03:00
const MIN_RECORDS_TO_KEEP = 100 // Sempre manter pelo menos 100 registos

// ─────────────────────────────────────────────────────────────
// FUNÇÃO DE LIMPEZA
// ─────────────────────────────────────────────────────────────

async function cleanupOldExecutions(): Promise<{
  success: boolean
  deleted: number
  remaining: number
  error?: string
}> {
  const executionId = `CLEANUP-${Date.now()}`
  
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`🧹 INICIANDO LIMPEZA DE HISTÓRICO - ${executionId}`)
  console.log(`${'═'.repeat(70)}`)

  const startTime = Date.now()

  try {
    // Calcular data limite (90 dias atrás)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS)

    console.log(`📅 Data limite: ${cutoffDate.toISOString()}`)
    console.log(`   Registos anteriores a esta data serão removidos`)

    // Contar total de registos
    const totalBefore = await CronExecution.countDocuments()
    console.log(`📊 Total de registos ANTES: ${totalBefore}`)

    // Contar registos a remover
    const toDelete = await CronExecution.countDocuments({
      startTime: { $lt: cutoffDate }
    })
    console.log(`🗑️  Registos candidatos à remoção: ${toDelete}`)

    // ✅ PROTEÇÃO: Sempre manter pelo menos MIN_RECORDS_TO_KEEP
    if (totalBefore - toDelete < MIN_RECORDS_TO_KEEP) {
      const keepCount = Math.max(MIN_RECORDS_TO_KEEP, totalBefore - toDelete)
      console.log(`⚠️  PROTEÇÃO ATIVADA: Manter pelo menos ${MIN_RECORDS_TO_KEEP} registos`)
      console.log(`   Nenhum registo será removido nesta execução`)
      
      return {
        success: true,
        deleted: 0,
        remaining: totalBefore,
        error: `Proteção ativada: manter mínimo de ${MIN_RECORDS_TO_KEEP} registos`
      }
    }

    // Executar remoção
    const result = await CronExecution.deleteMany({
      startTime: { $lt: cutoffDate }
    })

    // Contar registos restantes
    const totalAfter = await CronExecution.countDocuments()

    const duration = Date.now() - startTime

    console.log(`\n${'─'.repeat(70)}`)
    console.log(`✅ LIMPEZA CONCLUÍDA`)
    console.log(`${'─'.repeat(70)}`)
    console.log(`🗑️  Registos removidos: ${result.deletedCount}`)
    console.log(`📊 Registos restantes: ${totalAfter}`)
    console.log(`💾 Espaço liberado: ~${(result.deletedCount * 0.5).toFixed(2)} KB (estimado)`)
    console.log(`⏱️  Tempo total: ${(duration / 1000).toFixed(2)}s`)
    console.log(`${'═'.repeat(70)}\n`)

    return {
      success: true,
      deleted: result.deletedCount,
      remaining: totalAfter
    }

  } catch (error: any) {
    const duration = Date.now() - startTime
    
    console.error(`\n${'═'.repeat(70)}`)
    console.error(`❌ ERRO NA LIMPEZA - ${executionId}`)
    console.error(`${'═'.repeat(70)}`)
    console.error(`Erro: ${error.message}`)
    console.error(`Tempo até falha: ${(duration / 1000).toFixed(2)}s`)
    console.error(`${'═'.repeat(70)}\n`)

    return {
      success: false,
      deleted: 0,
      remaining: await CronExecution.countDocuments(),
      error: error.message
    }
  }
}

// ─────────────────────────────────────────────────────────────
// AGENDAR JOB AUTOMÁTICO
// ─────────────────────────────────────────────────────────────

const cleanupJob = schedule.scheduleJob(CRON_SCHEDULE, async () => {
  console.log(`🕐 [CRON] Cleanup automático disparado: ${new Date().toISOString()}`)
  await cleanupOldExecutions()
})

console.log(`✅ CRON Job de limpeza configurado`)
console.log(`   Schedule: ${CRON_SCHEDULE} (Domingos às 03:00)`)
console.log(`   Retenção: ${RETENTION_DAYS} dias`)
console.log(`   Mínimo a manter: ${MIN_RECORDS_TO_KEEP} registos`)

// ─────────────────────────────────────────────────────────────
// EXPORTAR FUNÇÃO PARA EXECUÇÃO MANUAL
// ─────────────────────────────────────────────────────────────

export async function runCleanupManually(dryRun: boolean = false): Promise<any> {
  console.log(`🧪 Executando limpeza manual${dryRun ? ' (DRY RUN)' : ''}...`)
  
  if (dryRun) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS)

    const totalBefore = await CronExecution.countDocuments()
    const toDelete = await CronExecution.countDocuments({
      startTime: { $lt: cutoffDate }
    })

    console.log(`📊 Total de registos: ${totalBefore}`)
    console.log(`🗑️  Registos a remover: ${toDelete}`)
    console.log(`📅 Data limite: ${cutoffDate.toISOString()}`)
    console.log(`🔍 DRY RUN - Nenhum registo foi removido`)

    return {
      success: true,
      dryRun: true,
      wouldDelete: toDelete,
      totalBefore
    }
  }

  return await cleanupOldExecutions()
}

export default cleanupJob