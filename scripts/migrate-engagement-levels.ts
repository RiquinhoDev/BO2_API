// ════════════════════════════════════════════════════════════
// 🔄 MIGRAÇÃO: Unificar nomenclatura engagementLevel
// Inglês → Português
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../src/models/user'

dotenv.config()

const MIGRATION_MAP = {
  'HIGH': 'ALTO',
  'MEDIUM': 'MEDIO',
  'LOW': 'BAIXO',
  'VERY_HIGH': 'MUITO_ALTO',
  'VERY_LOW': 'MUITO_BAIXO'
}

async function migrate() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('🔄 MIGRAÇÃO: Unificar nomenclatura engagementLevel')
  console.log('═'.repeat(70))
  console.log()
  console.log('Inglês → Português')
  console.log('  HIGH      → ALTO')
  console.log('  MEDIUM    → MEDIO')
  console.log('  LOW       → BAIXO')
  console.log('  VERY_HIGH → MUITO_ALTO')
  console.log('  VERY_LOW  → MUITO_BAIXO')
  console.log()
  
  try {
    // 1. Conectar MongoDB
    console.log('📡 Conectando ao MongoDB...')
    const mongoUri = process.env.MONGODB_URI || "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"
    await mongoose.connect(mongoUri)
    console.log('✅ Conectado')
    console.log()
    
    // 2. Verificar quantos users precisam migração
    console.log('═'.repeat(70))
    console.log('📊 ANÁLISE PRÉ-MIGRAÇÃO')
    console.log('═'.repeat(70))
    console.log()
    
    const hotmartNeedsMigration = await User.countDocuments({
      'hotmart.engagement.engagementLevel': { 
        $in: ['HIGH', 'MEDIUM', 'LOW', 'VERY_HIGH', 'VERY_LOW'] 
      }
    })
    
    const curseducaNeedsMigration = await User.countDocuments({
      'curseduca.engagement.engagementLevel': { 
        $in: ['HIGH', 'MEDIUM', 'LOW', 'VERY_HIGH', 'VERY_LOW'] 
      }
    })
    
    const totalUsers = await User.countDocuments()
    
    console.log(`📊 Total de users: ${totalUsers}`)
    console.log(`🔥 Hotmart precisa migrar: ${hotmartNeedsMigration}`)
    console.log(`🎓 CursEduca precisa migrar: ${curseducaNeedsMigration}`)
    console.log()
    
    // Detalhar por valor
    console.log('📋 DISTRIBUIÇÃO POR VALOR:')
    console.log()
    
    for (const [oldValue, newValue] of Object.entries(MIGRATION_MAP)) {
      const hotmartCount = await User.countDocuments({
        'hotmart.engagement.engagementLevel': oldValue
      })
      
      const curseducaCount = await User.countDocuments({
        'curseduca.engagement.engagementLevel': oldValue
      })
      
      if (hotmartCount > 0 || curseducaCount > 0) {
        console.log(`   ${oldValue} → ${newValue}:`)
        if (hotmartCount > 0) console.log(`      Hotmart: ${hotmartCount}`)
        if (curseducaCount > 0) console.log(`      CursEduca: ${curseducaCount}`)
      }
    }
    
    console.log()
    
    if (hotmartNeedsMigration === 0 && curseducaNeedsMigration === 0) {
      console.log('✅ Nenhum user precisa de migração!')
      console.log('   Todos os valores já estão em português.')
      console.log()
      await mongoose.connection.close()
      return
    }
    
    // 3. Confirmar migração
    console.log('═'.repeat(70))
    console.log('⚠️  CONFIRMAR MIGRAÇÃO')
    console.log('═'.repeat(70))
    console.log()
    console.log(`Vais migrar ${hotmartNeedsMigration + curseducaNeedsMigration} registos.`)
    console.log()
    console.log('Esta operação:')
    console.log('  ✅ É SEGURA (só muda valores de enum)')
    console.log('  ✅ É REVERSÍVEL (pode voltar atrás)')
    console.log('  ✅ Não afeta outros campos')
    console.log()
    console.log('⏳ Continuando em 5 segundos...')
    console.log('   (Ctrl+C para cancelar)')
    console.log()
    
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // 4. MIGRAÇÃO HOTMART
    console.log('═'.repeat(70))
    console.log('🔥 MIGRANDO HOTMART')
    console.log('═'.repeat(70))
    console.log()
    
    let hotmartMigrated = 0
    
    for (const [oldValue, newValue] of Object.entries(MIGRATION_MAP)) {
      const result = await User.updateMany(
        { 'hotmart.engagement.engagementLevel': oldValue },
        { $set: { 'hotmart.engagement.engagementLevel': newValue } },
        { validateBeforeSave: false }
      )
      
      if (result.modifiedCount > 0) {
        console.log(`   ✅ ${oldValue} → ${newValue}: ${result.modifiedCount} users`)
        hotmartMigrated += result.modifiedCount
      }
    }
    
    console.log()
    console.log(`✅ Hotmart migrado: ${hotmartMigrated} users`)
    console.log()
    
    // 5. MIGRAÇÃO CURSEDUCA
    console.log('═'.repeat(70))
    console.log('🎓 MIGRANDO CURSEDUCA')
    console.log('═'.repeat(70))
    console.log()
    
    let curseducaMigrated = 0
    
    for (const [oldValue, newValue] of Object.entries(MIGRATION_MAP)) {
      const result = await User.updateMany(
        { 'curseduca.engagement.engagementLevel': oldValue },
        { $set: { 'curseduca.engagement.engagementLevel': newValue } },
        { validateBeforeSave: false }
      )
      
      if (result.modifiedCount > 0) {
        console.log(`   ✅ ${oldValue} → ${newValue}: ${result.modifiedCount} users`)
        curseducaMigrated += result.modifiedCount
      }
    }
    
    console.log()
    console.log(`✅ CursEduca migrado: ${curseducaMigrated} users`)
    console.log()
    
    // 6. VERIFICAÇÃO PÓS-MIGRAÇÃO
    console.log('═'.repeat(70))
    console.log('📊 VERIFICAÇÃO PÓS-MIGRAÇÃO')
    console.log('═'.repeat(70))
    console.log()
    
    const stillNeedsMigrationHotmart = await User.countDocuments({
      'hotmart.engagement.engagementLevel': { 
        $in: ['HIGH', 'MEDIUM', 'LOW', 'VERY_HIGH', 'VERY_LOW'] 
      }
    })
    
    const stillNeedsMigrationCurseduca = await User.countDocuments({
      'curseduca.engagement.engagementLevel': { 
        $in: ['HIGH', 'MEDIUM', 'LOW', 'VERY_HIGH', 'VERY_LOW'] 
      }
    })
    
    console.log(`🔥 Hotmart ainda em inglês: ${stillNeedsMigrationHotmart}`)
    console.log(`🎓 CursEduca ainda em inglês: ${stillNeedsMigrationCurseduca}`)
    console.log()
    
    // Contar valores em português
    const portugueseValues = ['MUITO_ALTO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO', 'NONE']
    
    const hotmartPortuguese = await User.countDocuments({
      'hotmart.engagement.engagementLevel': { $in: portugueseValues }
    })
    
    const curseducaPortuguese = await User.countDocuments({
      'curseduca.engagement.engagementLevel': { $in: portugueseValues }
    })
    
    console.log(`✅ Hotmart em português: ${hotmartPortuguese}`)
    console.log(`✅ CursEduca em português: ${curseducaPortuguese}`)
    console.log()
    
    // 7. RESULTADO FINAL
    console.log('═'.repeat(70))
    console.log('🎉 MIGRAÇÃO COMPLETA!')
    console.log('═'.repeat(70))
    console.log()
    console.log('📊 RESUMO:')
    console.log(`   Total migrado: ${hotmartMigrated + curseducaMigrated} registos`)
    console.log(`   Hotmart: ${hotmartMigrated}`)
    console.log(`   CursEduca: ${curseducaMigrated}`)
    console.log()
    
    if (stillNeedsMigrationHotmart === 0 && stillNeedsMigrationCurseduca === 0) {
      console.log('✅ SUCESSO TOTAL!')
      console.log('   Todos os valores foram migrados para português.')
    } else {
      console.log('⚠️  ATENÇÃO:')
      console.log(`   ${stillNeedsMigrationHotmart + stillNeedsMigrationCurseduca} registos ainda precisam migração`)
      console.log('   Pode haver valores diferentes dos esperados.')
    }
    
    console.log()
    console.log('═'.repeat(70))
    console.log('📋 PRÓXIMOS PASSOS:')
    console.log('═'.repeat(70))
    console.log()
    console.log('1. ✅ Migração completa')
    console.log('2. 🔄 Testar ResetCounters novamente:')
    console.log('      npx ts-node scripts/test-e2e-all-jobs.ts')
    console.log('3. ✅ Deve funcionar SEM erros agora!')
    console.log()
    
    // Fechar conexão
    await mongoose.connection.close()
    console.log('✅ MongoDB desconectado')
    console.log()
    
  } catch (error: any) {
    console.error()
    console.error('═'.repeat(70))
    console.error('❌ ERRO NA MIGRAÇÃO!')
    console.error('═'.repeat(70))
    console.error()
    console.error('Erro:', error.message)
    console.error()
    console.error('Stack:')
    console.error(error.stack)
    console.error()
    
    // Fechar conexão mesmo com erro
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close()
    }
    
    process.exit(1)
  }
}

migrate()