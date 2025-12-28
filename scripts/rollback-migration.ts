// ════════════════════════════════════════════════════════════
// ↩️  ROLLBACK: Reverter migração (Português → Inglês)
// Usar apenas se necessário!
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../src/models/user'

dotenv.config()

const ROLLBACK_MAP = {
  'ALTO': 'HIGH',
  'MEDIO': 'MEDIUM',
  'BAIXO': 'LOW',
  'MUITO_ALTO': 'VERY_HIGH',
  'MUITO_BAIXO': 'VERY_LOW'
}

async function rollback() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('↩️  ROLLBACK: Reverter migração')
  console.log('═'.repeat(70))
  console.log()
  console.log('⚠️  ATENÇÃO: Esta operação reverte para inglês!')
  console.log()
  console.log('Português → Inglês')
  console.log('  ALTO       → HIGH')
  console.log('  MEDIO      → MEDIUM')
  console.log('  BAIXO      → LOW')
  console.log('  MUITO_ALTO → VERY_HIGH')
  console.log('  MUITO_BAIXO → VERY_LOW')
  console.log()
  
  try {
    // Conectar
    console.log('📡 Conectando ao MongoDB...')
    const mongoUri = process.env.MONGODB_URI || "mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"
    await mongoose.connect(mongoUri)
    console.log('✅ Conectado')
    console.log()
    
    // Verificar
    const needsRollback = await User.countDocuments({
      $or: [
        { 'hotmart.engagement.engagementLevel': { 
          $in: ['MUITO_ALTO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO'] 
        }},
        { 'curseduca.engagement.engagementLevel': { 
          $in: ['MUITO_ALTO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO'] 
        }}
      ]
    })
    
    console.log(`📊 Users a reverter: ${needsRollback}`)
    console.log()
    
    if (needsRollback === 0) {
      console.log('✅ Nenhum user em português para reverter.')
      await mongoose.connection.close()
      return
    }
    
    // Confirmar
    console.log('⚠️  TENS CERTEZA?')
    console.log('   Esta operação reverte todos os valores para inglês!')
    console.log()
    console.log('⏳ Continuando em 5 segundos...')
    console.log('   (Ctrl+C para cancelar)')
    console.log()
    
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Rollback
    console.log('═'.repeat(70))
    console.log('🔄 EXECUTANDO ROLLBACK')
    console.log('═'.repeat(70))
    console.log()
    
    let totalReverted = 0
    
    for (const [portugueseValue, englishValue] of Object.entries(ROLLBACK_MAP)) {
      // Hotmart
      const hotmartResult = await User.updateMany(
        { 'hotmart.engagement.engagementLevel': portugueseValue },
        { $set: { 'hotmart.engagement.engagementLevel': englishValue } },
        { validateBeforeSave: false }
      )
      
      // CursEduca
      const curseducaResult = await User.updateMany(
        { 'curseduca.engagement.engagementLevel': portugueseValue },
        { $set: { 'curseduca.engagement.engagementLevel': englishValue } },
        { validateBeforeSave: false }
      )
      
      const total = hotmartResult.modifiedCount + curseducaResult.modifiedCount
      
      if (total > 0) {
        console.log(`   ↩️  ${portugueseValue} → ${englishValue}: ${total} users`)
        totalReverted += total
      }
    }
    
    console.log()
    console.log(`✅ Total revertido: ${totalReverted} registos`)
    console.log()
    
    await mongoose.connection.close()
    console.log('✅ Rollback completo')
    console.log()
    
  } catch (error: any) {
    console.error('\n❌ Erro no rollback:', error.message)
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close()
    }
    
    process.exit(1)
  }
}

rollback()