// ════════════════════════════════════════════════════════════
// 🔧 TESTE DEFINITIVO + CORREÇÃO FORÇADA isPrimary
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import UserProduct from '../src/models/UserProduct'
import User from '../src/models/user'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

async function testAndFix() {
  await mongoose.connect(MONGODB_URI)
  
  console.log('\n🔧 ════════════════════════════════════════════════════════════')
  console.log('🔧 TESTE DEFINITIVO + CORREÇÃO FORÇADA')
  console.log('🔧 ════════════════════════════════════════════════════════════\n')
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 1: VERIFICAR SCHEMA
  // ═══════════════════════════════════════════════════════════
  
  console.log('📋 PASSO 1: Verificar schema UserProduct')
  console.log('-'.repeat(70))
  
  const schema = UserProduct.schema
  const hasIsPrimary = schema.path('isPrimary')
  
  console.log(`   Schema tem isPrimary: ${hasIsPrimary ? '✅ SIM' : '❌ NÃO'}`)
  
  if (hasIsPrimary) {
    const pathType = (hasIsPrimary as any).instance
    console.log(`   Tipo: ${pathType}`)
  } else {
    console.log('   ❌ PROBLEMA CRÍTICO: Schema NÃO TEM isPrimary!')
    console.log('   💡 Precisas adicionar ao schema UserProduct:\n')
    console.log('   isPrimary: {')
    console.log('     type: Boolean,')
    console.log('     default: true')
    console.log('   }\n')
  }
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 2: VERIFICAR DADOS ATUAIS
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n📊 PASSO 2: Estado atual dos dados')
  console.log('-'.repeat(70))
  
  const total = await UserProduct.countDocuments({ platform: 'curseduca' })
  const withIsPrimary = await UserProduct.countDocuments({ 
    platform: 'curseduca',
    isPrimary: { $exists: true }
  })
  const isPrimaryTrue = await UserProduct.countDocuments({ 
    platform: 'curseduca',
    isPrimary: true
  })
  const isPrimaryFalse = await UserProduct.countDocuments({ 
    platform: 'curseduca',
    isPrimary: false
  })
  
  console.log(`   📦 Total: ${total}`)
  console.log(`   ✅ Com isPrimary: ${withIsPrimary}`)
  console.log(`   🟢 isPrimary=true: ${isPrimaryTrue}`)
  console.log(`   🔴 isPrimary=false: ${isPrimaryFalse}`)
  console.log(`   ⚠️  Sem isPrimary: ${total - withIsPrimary}`)
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 3: QUERY RAW (bypass Mongoose)
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n🔍 PASSO 3: Query RAW (bypass Mongoose)')
  console.log('-'.repeat(70))
  
  const rawCollection = mongoose.connection.collection('userproducts')
  
  const rawTotal = await rawCollection.countDocuments({ platform: 'curseduca' })
  const rawWithIsPrimary = await rawCollection.countDocuments({ 
    platform: 'curseduca',
    isPrimary: { $exists: true }
  })
  
  console.log(`   📦 Total (raw): ${rawTotal}`)
  console.log(`   ✅ Com isPrimary (raw): ${rawWithIsPrimary}`)
  
  const sample = await rawCollection.findOne({ platform: 'curseduca' })
  console.log(`\n   📋 Exemplo de documento (raw):`)
  console.log(`      Email: ${(sample as any)?.userId || 'unknown'}`)
  console.log(`      isPrimary: ${(sample as any)?.isPrimary ?? 'undefined'}`)
  console.log(`      Campos: ${Object.keys(sample || {}).join(', ')}`)
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 4: CORREÇÃO FORÇADA
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n🔧 PASSO 4: Correção forçada (MongoDB direto)')
  console.log('-'.repeat(70))
  
  // Agrupar por userId + buscar emails únicos
  const pipeline = [
    { $match: { platform: 'curseduca' } },
    { 
      $group: { 
        _id: '$userId', 
        products: { $push: '$$ROOT' },
        count: { $sum: 1 }
      } 
    }
  ]
  
  const grouped = await rawCollection.aggregate(pipeline).toArray()
  
  console.log(`   📊 ${grouped.length} users agrupados`)
  
  let primaryCount = 0
  let secondaryCount = 0
  
  for (const group of grouped) {
    const products = (group as any).products
    
    if (products.length === 1) {
      // 1 produto = PRIMARY
      await rawCollection.updateOne(
        { _id: products[0]._id },
        { $set: { isPrimary: true } }
      )
      primaryCount++
    } else {
      // Múltiplos produtos = ordenar por enrolledAt
      products.sort((a: any, b: any) => {
        const dateA = a.enrolledAt ? new Date(a.enrolledAt).getTime() : 0
        const dateB = b.enrolledAt ? new Date(b.enrolledAt).getTime() : 0
        return dateB - dateA
      })
      
      // Primeiro = PRIMARY
      await rawCollection.updateOne(
        { _id: products[0]._id },
        { $set: { isPrimary: true } }
      )
      primaryCount++
      
      // Resto = SECONDARY
      for (let i = 1; i < products.length; i++) {
        await rawCollection.updateOne(
          { _id: products[i]._id },
          { $set: { isPrimary: false } }
        )
        secondaryCount++
      }
    }
  }
  
  console.log(`   ✅ ${primaryCount} produtos marcados como PRIMARY`)
  console.log(`   🔴 ${secondaryCount} produtos marcados como SECONDARY`)
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 5: VALIDAÇÃO FINAL
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n✅ PASSO 5: Validação final')
  console.log('-'.repeat(70))
  
  const finalTotal = await rawCollection.countDocuments({ platform: 'curseduca' })
  const finalWithIsPrimary = await rawCollection.countDocuments({ 
    platform: 'curseduca',
    isPrimary: { $exists: true }
  })
  const finalTrue = await rawCollection.countDocuments({ 
    platform: 'curseduca',
    isPrimary: true
  })
  const finalFalse = await rawCollection.countDocuments({ 
    platform: 'curseduca',
    isPrimary: false
  })
  
  console.log(`   📦 Total: ${finalTotal}`)
  console.log(`   ✅ Com isPrimary: ${finalWithIsPrimary}`)
  console.log(`   🟢 isPrimary=true: ${finalTrue}`)
  console.log(`   🔴 isPrimary=false: ${finalFalse}`)
  console.log(`   ⚠️  Sem isPrimary: ${finalTotal - finalWithIsPrimary}`)
  
  // ═══════════════════════════════════════════════════════════
  // RESULTADO FINAL
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n' + '═'.repeat(70))
  console.log('🎯 RESULTADO FINAL')
  console.log('═'.repeat(70) + '\n')
  
  const percentage = Math.round((finalWithIsPrimary / finalTotal) * 100)
  
  if (percentage === 100) {
    console.log('✅ PERFEITO! 100% dos UserProducts têm isPrimary')
    console.log(`✅ ${finalTrue} produtos primários`)
    console.log(`✅ ${finalFalse} produtos secundários`)
    console.log('\n🎉 SISTEMA 100% FUNCIONAL!')
  } else {
    console.log(`⚠️  ${percentage}% têm isPrimary`)
    console.log(`⚠️  ${finalTotal - finalWithIsPrimary} ainda sem isPrimary`)
  }
  
  console.log('\n' + '═'.repeat(70) + '\n')
  
  await mongoose.disconnect()
}

testAndFix()