// ═══════════════════════════════════════════════════════════════════════════
// 🔄 SCRIPT: Recalcular Engagement Metrics
// ═══════════════════════════════════════════════════════════════════════════
// 
// OBJETIVO:
// Recalcular TODOS os engagement metrics de TODOS os UserProducts ativos
// 
// NOVO: Vai popular daysSinceEnrollment para regras CLAREZA!
// 
// EXECUTAR:
// npx ts-node --transpile-only scripts/recalculate-engagement.ts
// 
// ═══════════════════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import { recalculateAllEngagementMetrics } from '../src/services/ac/recalculate-engagement-metrics'


async function main() {
  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 1: CONECTAR À BD
    // ═══════════════════════════════════════════════════════════
    
    console.log('🔄 Conectando à MongoDB...\n')
    
        await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    
    
    console.log('✅ Conectado!\n')

    // ═══════════════════════════════════════════════════════════
    // STEP 2: EXECUTAR RECÁLCULO
    // ═══════════════════════════════════════════════════════════
    
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🔄 INICIANDO RECÁLCULO DE ENGAGEMENT METRICS')
    console.log('═══════════════════════════════════════════════════════════')
    console.log()
    console.log('📊 Campos que serão atualizados:')
    console.log('   - daysSinceLastLogin (OGI)')
    console.log('   - daysSinceLastAction (CLAREZA)')
    console.log('   - daysSinceEnrollment (CLAREZA - NOVO!) 🆕')
    console.log('   - enrolledAt (CLAREZA - NOVO!) 🆕')
    console.log('   - actionsLastWeek')
    console.log('   - actionsLastMonth')
    console.log()
    console.log('⏱️ Tempo estimado: 3-5 minutos')
    console.log('═══════════════════════════════════════════════════════════\n')

    const result = await recalculateAllEngagementMetrics()

    // ═══════════════════════════════════════════════════════════
    // STEP 3: MOSTRAR RESULTADOS
    // ═══════════════════════════════════════════════════════════
    
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('✅ RECÁLCULO COMPLETO!')
    console.log('═══════════════════════════════════════════════════════════')
    console.log()
    console.log('📊 ESTATÍSTICAS:')
    console.log(`   Total UserProducts: ${result.stats.total}`)
    console.log(`   Processados: ${result.stats.processed}`)
    console.log(`   Atualizados: ${result.stats.updated}`)
    console.log(`   Sem mudanças: ${result.stats.skipped}`)
    console.log(`   Erros: ${result.stats.errors}`)
    console.log()
    console.log(`⏱️ Duração: ${result.stats.duration}s`)
    console.log(`⚡ Performance: ${(result.stats.processed / (result.stats.duration || 1)).toFixed(2)} UserProducts/segundo`)
    console.log()

    if (result.errors.length > 0) {
      console.log('❌ ERROS ENCONTRADOS:')
      result.errors.slice(0, 10).forEach((err, i) => {
        console.log(`   ${i + 1}. UserProduct ${err.userProductId}: ${err.error}`)
      })
      if (result.errors.length > 10) {
        console.log(`   ... e mais ${result.errors.length - 10} erros`)
      }
      console.log()
    }

    console.log('═══════════════════════════════════════════════════════════')
    console.log('🎯 PRÓXIMOS PASSOS:')
    console.log('═══════════════════════════════════════════════════════════')
    console.log()
    console.log('1️⃣ Testar regras CLAREZA com users específicos:')
    console.log('   POST /api/test/evaluate-user-tags')
    console.log('   { "email": "e-learning@prospectiva.pt", "productCode": "CLAREZA" }')
    console.log()
    console.log('2️⃣ Validar que daysSinceEnrollment foi populado:')
    console.log('   - Magda: 77 dias (desde 2025-10-15)')
    console.log('   - Outros: verificar datas de inscrição')
    console.log()
    console.log('3️⃣ Executar CRON completo:')
    console.log('   - Vai aplicar tags automaticamente')
    console.log('   - Validar em Active Campaign')
    console.log()
    console.log('═══════════════════════════════════════════════════════════\n')

  } catch (error: any) {
    console.error('\n❌ ERRO FATAL:', error.message)
    console.error('\nStack:', error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('✅ Desconectado da MongoDB\n')
  }
}

// Executar
main()