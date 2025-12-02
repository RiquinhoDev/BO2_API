// ════════════════════════════════════════════════════════════
// 📁 BO2_API/scripts/migrate-group7-fixed.ts
// MIGRAÇÃO FINAL CORRIGIDA: Grupo 7 → CLAREZA_ANUAL
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import User from '../src/models/user'
import Product from '../src/models/Product'
import UserProduct from '../src/models/UserProduct'

interface MigrationStats {
  total: number
  success: number
  skipped: number
  errors: number
  errorDetails: Array<{
    userId: string
    email: string
    error: string
  }>
}

async function migrateGroup7(): Promise<MigrationStats> {
  console.log('\n🚀 MIGRAÇÃO FINAL CORRIGIDA: Grupo 7 → CLAREZA_ANUAL\n')
  console.log('═'.repeat(80))
  
  const stats: MigrationStats = {
    total: 0,
    success: 0,
    skipped: 0,
    errors: 0,
    errorDetails: []
  }
  
  // ───────────────────────────────────────────────────────────
  // 1. BUSCAR PRODUTO CLAREZA_ANUAL
  // ───────────────────────────────────────────────────────────
  
  const clarezaAnual = await Product.findOne({
    code: 'CLAREZA_ANUAL',
    isActive: true
  })
  
  if (!clarezaAnual) {
    console.log('❌ Produto CLAREZA_ANUAL não encontrado!')
    return stats
  }
  
  console.log('✅ Produto CLAREZA_ANUAL encontrado:')
  console.log(`   ID: ${clarezaAnual._id}`)
  console.log(`   Nome: ${clarezaAnual.name}`)
  console.log(`   GroupId: ${clarezaAnual.curseducaGroupId}\n`)
  
  // ───────────────────────────────────────────────────────────
  // 2. BUSCAR USERS DO GRUPO 7
  // ───────────────────────────────────────────────────────────
  
  console.log('━━━ BUSCAR USERS DO GRUPO 7 ━━━\n')
  
  const usersGroup7 = await User.find({
    'curseduca.groupCurseducaId': '7'
  }).lean()
  
  stats.total = usersGroup7.length
  
  console.log(`📊 Users encontrados: ${stats.total}`)
  
  if (stats.total === 0) {
    console.log('⚠️  Nenhum user encontrado!\n')
    return stats
  }
  
  // ───────────────────────────────────────────────────────────
  // 3. MIGRAR UM POR UM
  // ───────────────────────────────────────────────────────────
  
  console.log('\n━━━ MIGRAÇÃO (1 por 1 com campos corrigidos) ━━━\n')
  
  let progressCount = 0
  const progressInterval = Math.ceil(stats.total / 10)
  
  for (const user of usersGroup7) {
    progressCount++
    
    try {
      // Mostrar progresso
      if (progressCount % progressInterval === 0 || progressCount === stats.total) {
        console.log(`📊 Progresso: ${progressCount}/${stats.total} (${Math.round((progressCount / stats.total) * 100)}%)`)
      }
      
      // Verificar se já existe
      const existing = await UserProduct.findOne({
        userId: user._id,
        productId: clarezaAnual._id
      })
      
      if (existing) {
        stats.skipped++
        continue
      }
      
      // ✅ CORREÇÃO: Campos corretos do schema
      const newUserProduct = new UserProduct({
        userId: user._id,
        productId: clarezaAnual._id,
        platformUserId: user.curseduca?.curseducaUserId?.toString() || user._id.toString(), // ✅ ADICIONADO
        enrolledAt: new Date(),
        // ✅ REMOVIDO: status (não usar ou usar valor válido)
        platform: 'curseduca',
        sourceData: {
          curseducaUserId: user.curseduca?.curseducaUserId,
          groupCurseducaId: user.curseduca?.groupCurseducaId
        }
      })
      
      await newUserProduct.save()
      
      stats.success++
      
    } catch (error: any) {
      stats.errors++
      stats.errorDetails.push({
        userId: user._id?.toString() || 'unknown',
        email: user.email || 'unknown',
        error: error.message || 'Unknown error'
      })
      
      // Mostrar primeiro erro com detalhes
      if (stats.errors === 1) {
        console.log(`\n❌ PRIMEIRO ERRO (mostrando para debug):`)
        console.log(`   Email: ${user.email}`)
        console.log(`   Erro: ${error.message}`)
        console.log(`   User data:`, {
          _id: user._id,
          curseducaUserId: user.curseduca?.curseducaUserId,
          groupCurseducaId: user.curseduca?.groupCurseducaId
        })
        console.log(`   Stack: ${error.stack}\n`)
      }
    }
  }
  
  return stats
}
// ─────────────────────────────────────────────────────────────
// EXECUÇÃO
// ─────────────────────────────────────────────────────────────

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    
    console.log('🔌 Conectado ao MongoDB\n')
    
    const stats = await migrateGroup7()
    
    // ═══════════════════════════════════════════════════════════
    // RELATÓRIO FINAL
    // ═══════════════════════════════════════════════════════════
    
    console.log('\n═'.repeat(80))
    console.log('📊 RELATÓRIO FINAL\n')
    console.log(`Total de users: ${stats.total}`)
    console.log(`✅ Migrados com sucesso: ${stats.success}`)
    console.log(`⏭️  Já existiam (pulados): ${stats.skipped}`)
    console.log(`❌ Erros: ${stats.errors}`)
    
    if (stats.errors > 0) {
      console.log('\n━━━ DETALHES DOS ERROS ━━━\n')
      for (const error of stats.errorDetails.slice(0, 10)) {
        console.log(`❌ ${error.email}`)
        console.log(`   UserID: ${error.userId}`)
        console.log(`   Erro: ${error.error}\n`)
      }
      
      if (stats.errorDetails.length > 10) {
        console.log(`   ... e mais ${stats.errorDetails.length - 10} erros`)
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // VERIFICAÇÃO FINAL
    // ═══════════════════════════════════════════════════════════
    
    console.log('\n━━━ VERIFICAÇÃO FINAL ━━━\n')
    
    const clarezaAnual = await Product.findOne({
      code: 'CLAREZA_ANUAL',
      isActive: true
    })
    
    if (clarezaAnual) {
      const totalUserProducts = await UserProduct.countDocuments({
        productId: clarezaAnual._id
      })
      
      console.log(`📊 UserProducts do CLAREZA_ANUAL: ${totalUserProducts}`)
      
      if (totalUserProducts === 125) {
        console.log('✅ PERFEITO! Todos os 125 users foram migrados!')
      } else if (totalUserProducts > 0) {
        console.log(`⚠️  Migrados ${totalUserProducts}/125 (faltam ${125 - totalUserProducts})`)
      } else {
        console.log('❌ Nenhum UserProduct criado!')
      }
    }
    
    console.log('\n═'.repeat(80))
    
    if (stats.errors === 0 && stats.success === 125) {
      console.log('🎉 MISSÃO CUMPRIDA! Todos os users do Grupo 7 foram migrados!\n')
    } else if (stats.success > 0) {
      console.log('⚠️  Migração parcial. Veja os erros acima.\n')
    } else {
      console.log('❌ Migração falhou completamente. Veja os erros acima.\n')
    }
    
  } catch (error) {
    console.error('❌ Erro fatal:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Desconectado do MongoDB\n')
  }
}

run()