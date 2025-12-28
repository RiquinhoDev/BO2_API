// ════════════════════════════════════════════════════════════
// 🔍 VERIFICAÇÃO: Ver quantos users precisam migração
// (DRY RUN - sem fazer mudanças)
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../src/models/user'

dotenv.config()

async function verify() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('🔍 VERIFICAÇÃO: Migração engagementLevel')
  console.log('═'.repeat(70))
  console.log()
  console.log('⚠️  DRY RUN - Nenhuma mudança será feita!')
  console.log()
  
  try {
    // Conectar
    console.log('📡 Conectando ao MongoDB...')
    const mongoUri = process.env.MONGODB_URI || "mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"
    await mongoose.connect(mongoUri)
    console.log('✅ Conectado\n')
    
    // Análise
    const totalUsers = await User.countDocuments()
    
    console.log(`📊 Total de users na BD: ${totalUsers}`)
    console.log()
    
    // Hotmart
    console.log('═'.repeat(70))
    console.log('🔥 HOTMART - engagementLevel')
    console.log('═'.repeat(70))
    console.log()
    
    const hotmartLevels = await User.aggregate([
      { $match: { 'hotmart.engagement.engagementLevel': { $exists: true } } },
      { $group: {
        _id: '$hotmart.engagement.engagementLevel',
        count: { $sum: 1 }
      }},
      { $sort: { count: -1 } }
    ])
    
    if (hotmartLevels.length === 0) {
      console.log('   Nenhum user com Hotmart engagement')
    } else {
      hotmartLevels.forEach(level => {
        const emoji = ['HIGH', 'MEDIUM', 'LOW', 'VERY_HIGH', 'VERY_LOW'].includes(level._id) 
          ? '⚠️ ' : '✅'
        console.log(`   ${emoji} ${level._id}: ${level.count} users`)
      })
    }
    
    console.log()
    
    // CursEduca
    console.log('═'.repeat(70))
    console.log('🎓 CURSEDUCA - engagementLevel')
    console.log('═'.repeat(70))
    console.log()
    
    const curseducaLevels = await User.aggregate([
      { $match: { 'curseduca.engagement.engagementLevel': { $exists: true } } },
      { $group: {
        _id: '$curseduca.engagement.engagementLevel',
        count: { $sum: 1 }
      }},
      { $sort: { count: -1 } }
    ])
    
    if (curseducaLevels.length === 0) {
      console.log('   Nenhum user com CursEduca engagement')
    } else {
      curseducaLevels.forEach(level => {
        const emoji = ['HIGH', 'MEDIUM', 'LOW', 'VERY_HIGH', 'VERY_LOW'].includes(level._id) 
          ? '⚠️ ' : '✅'
        console.log(`   ${emoji} ${level._id}: ${level.count} users`)
      })
    }
    
    console.log()
    
    // Resumo
    console.log('═'.repeat(70))
    console.log('📊 RESUMO')
    console.log('═'.repeat(70))
    console.log()
    
    const needsMigration = await User.countDocuments({
      $or: [
        { 'hotmart.engagement.engagementLevel': { 
          $in: ['HIGH', 'MEDIUM', 'LOW', 'VERY_HIGH', 'VERY_LOW'] 
        }},
        { 'curseduca.engagement.engagementLevel': { 
          $in: ['HIGH', 'MEDIUM', 'LOW', 'VERY_HIGH', 'VERY_LOW'] 
        }}
      ]
    })
    
    const alreadyMigrated = await User.countDocuments({
      $or: [
        { 'hotmart.engagement.engagementLevel': { 
          $in: ['MUITO_ALTO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO', 'NONE'] 
        }},
        { 'curseduca.engagement.engagementLevel': { 
          $in: ['MUITO_ALTO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO', 'NONE'] 
        }}
      ]
    })
    
    console.log(`⚠️  Precisam migração (inglês): ${needsMigration}`)
    console.log(`✅ Já migrados (português): ${alreadyMigrated}`)
    console.log()
    
    if (needsMigration === 0) {
      console.log('🎉 PERFEITO!')
      console.log('   Todos os valores já estão em português.')
      console.log('   Não é necessário migrar.')
    } else {
      console.log('📋 PRÓXIMO PASSO:')
      console.log()
      console.log('   Executar migração:')
      console.log('   → npx ts-node scripts/migrate-engagement-levels.ts')
    }
    
    console.log()
    
    await mongoose.connection.close()
    console.log('✅ Verificação completa')
    
  } catch (error: any) {
    console.error('\n❌ Erro:', error.message)
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close()
    }
    
    process.exit(1)
  }
}

verify()