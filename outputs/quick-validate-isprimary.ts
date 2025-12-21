// ════════════════════════════════════════════════════════════
// ✅ VALIDAÇÃO RÁPIDA - isPrimary
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import UserProduct from '../src/models/UserProduct'
import User from '../src/models/user'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

async function quickValidation() {
  await mongoose.connect(MONGODB_URI)
  
  console.log('\n✅ ════════════════════════════════════════════════════════════')
  console.log('✅ VALIDAÇÃO RÁPIDA - isPrimary')
  console.log('✅ ════════════════════════════════════════════════════════════\n')
  
  // ═══════════════════════════════════════════════════════════
  // 1. ESTATÍSTICAS GERAIS
  // ═══════════════════════════════════════════════════════════
  
  console.log('📊 ESTATÍSTICAS GERAIS:')
  console.log('-'.repeat(70))
  
  const stats = {
    total: await UserProduct.countDocuments({ platform: 'curseduca' }),
    withIsPrimary: await UserProduct.countDocuments({ 
      platform: 'curseduca',
      isPrimary: { $exists: true }
    }),
    isPrimaryTrue: await UserProduct.countDocuments({ 
      platform: 'curseduca',
      isPrimary: true
    }),
    isPrimaryFalse: await UserProduct.countDocuments({ 
      platform: 'curseduca',
      isPrimary: false
    }),
    isPrimaryUndefined: 0
  }
  
  stats.isPrimaryUndefined = stats.total - stats.withIsPrimary
  
  console.log(`   📦 Total UserProducts: ${stats.total}`)
  console.log(`   ✅ Com isPrimary: ${stats.withIsPrimary}`)
  console.log(`   🟢 isPrimary=true: ${stats.isPrimaryTrue}`)
  console.log(`   🔴 isPrimary=false: ${stats.isPrimaryFalse}`)
  console.log(`   ⚠️  isPrimary=undefined: ${stats.isPrimaryUndefined}\n`)
  
  // ═══════════════════════════════════════════════════════════
  // 2. VALIDAÇÃO DE QUALIDADE
  // ═══════════════════════════════════════════════════════════
  
  console.log('🎯 VALIDAÇÃO DE QUALIDADE:')
  console.log('-'.repeat(70))
  
  const percentageDefined = Math.round((stats.withIsPrimary / stats.total) * 100)
  
  if (percentageDefined === 100) {
    console.log(`   ✅ PERFEITO! 100% dos UserProducts têm isPrimary`)
  } else if (percentageDefined >= 95) {
    console.log(`   ✅ BOM! ${percentageDefined}% dos UserProducts têm isPrimary`)
  } else if (percentageDefined >= 80) {
    console.log(`   ⚠️  RAZOÁVEL! ${percentageDefined}% dos UserProducts têm isPrimary`)
  } else {
    console.log(`   ❌ CRÍTICO! Apenas ${percentageDefined}% dos UserProducts têm isPrimary`)
  }
  
  // ═══════════════════════════════════════════════════════════
  // 3. VALIDAÇÃO DE LÓGICA (isPrimary=true vs total users)
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n🔍 VALIDAÇÃO DE LÓGICA:')
  console.log('-'.repeat(70))
  
  // Contar users únicos
  const uniqueUserIds = await UserProduct.distinct('userId', { platform: 'curseduca' })
  const uniqueUsers = uniqueUserIds.length
  
  console.log(`   📧 Users únicos (distinct userId): ${uniqueUsers}`)
  console.log(`   🟢 isPrimary=true: ${stats.isPrimaryTrue}`)
  
  const difference = Math.abs(uniqueUsers - stats.isPrimaryTrue)
  
  if (difference === 0) {
    console.log(`   ✅ PERFEITO! isPrimary=true (${stats.isPrimaryTrue}) = Users únicos (${uniqueUsers})`)
  } else if (difference <= 5) {
    console.log(`   ✅ BOM! Diferença aceitável: ${difference} users`)
  } else {
    console.log(`   ⚠️  ATENÇÃO! Diferença de ${difference} users`)
    console.log(`   💡 Pode indicar duplicados não marcados ou erro no sync`)
  }
  
  // ═══════════════════════════════════════════════════════════
  // 4. EXEMPLOS CONCRETOS
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n📋 EXEMPLOS (5 users):')
  console.log('-'.repeat(70))
  
  const examples = await UserProduct.find({ platform: 'curseduca' })
    .limit(5)
    .lean()
  
  for (const up of examples) {
    const user = await User.findById(up.userId).select('email').lean()
    const email = user?.email || 'unknown'
    
    const status = up.isPrimary === true ? '🟢 PRIMARY' : 
                   up.isPrimary === false ? '🔴 SECONDARY' : 
                   '⚠️  UNDEFINED'
    
    console.log(`   ${status} | ${email}`)
    console.log(`      Progress: ${up.progress?.percentage || 0}% | Engagement: ${up.engagement?.engagementScore || 0}`)
  }
  
  // ═══════════════════════════════════════════════════════════
  // 5. VERIFICAR DUPLICADOS
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n🔁 VERIFICAÇÃO DE DUPLICADOS:')
  console.log('-'.repeat(70))
  
  // Agrupar por userId para ver quem tem múltiplos produtos
  const duplicates = await UserProduct.aggregate([
    { $match: { platform: 'curseduca' } },
    { $group: { _id: '$userId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'total' }
  ])
  
  const duplicateCount = duplicates.length > 0 ? duplicates[0].total : 0
  
  console.log(`   📊 Users com múltiplos produtos: ${duplicateCount}`)
  console.log(`   🔴 Produtos secundários (isPrimary=false): ${stats.isPrimaryFalse}`)
  
  if (duplicateCount * 2 >= stats.isPrimaryFalse) {
    console.log(`   ✅ Lógica correta! Duplicados marcados como secondary`)
  } else {
    console.log(`   ⚠️  Possível inconsistência nos secundários`)
  }
  
  // ═══════════════════════════════════════════════════════════
  // 6. RESULTADO FINAL
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n' + '═'.repeat(70))
  console.log('🎯 RESULTADO FINAL:')
  console.log('═'.repeat(70))
  
  let score = 0
  let maxScore = 4
  
  // Critério 1: Todos têm isPrimary definido
  if (percentageDefined === 100) score++
  
  // Critério 2: isPrimary=true bate com users únicos
  if (difference <= 5) score++
  
  // Critério 3: Tem dados de progress
  const withProgress = await UserProduct.countDocuments({ 
    platform: 'curseduca',
    'progress.percentage': { $gt: 0 }
  })
  if (withProgress > stats.total * 0.5) score++
  
  // Critério 4: Tem dados de engagement
  const withEngagement = await UserProduct.countDocuments({ 
    platform: 'curseduca',
    'engagement.engagementScore': { $gt: 0 }
  })
  if (withEngagement > stats.total * 0.5) score++
  
  const finalScore = Math.round((score / maxScore) * 100)
  
  console.log(`\n   📊 Score: ${score}/${maxScore} (${finalScore}%)`)
  
  if (finalScore === 100) {
    console.log(`   ✅ PERFEITO! Sistema 100% funcional`)
  } else if (finalScore >= 75) {
    console.log(`   ✅ BOM! Sistema funcional com pequenos detalhes`)
  } else if (finalScore >= 50) {
    console.log(`   ⚠️  RAZOÁVEL! Sistema funciona mas precisa atenção`)
  } else {
    console.log(`   ❌ CRÍTICO! Sistema precisa correção urgente`)
  }
  
  console.log('\n' + '═'.repeat(70) + '\n')
  
  await mongoose.disconnect()
}

quickValidation()