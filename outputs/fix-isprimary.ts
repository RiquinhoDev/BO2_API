// ════════════════════════════════════════════════════════════
// 🔧 CORRIGIR isPrimary - Re-sync CursEDuca (CORRIGIDO)
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import UserProduct from '../src/models/UserProduct'
import User from '../src/models/user'
import axios from 'axios'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

async function fixIsPrimary() {
  await mongoose.connect(MONGODB_URI)
  
  console.log('\n🔧 ════════════════════════════════════════════════════════════')
  console.log('🔧 CORRIGINDO isPrimary - Re-sync CursEDuca')
  console.log('🔧 ════════════════════════════════════════════════════════════\n')
  
  // 1. Verificar estado ANTES
  console.log('📊 ESTADO ANTES DO RE-SYNC:')
  console.log('-'.repeat(70))
  
  const totalCurseduca = await UserProduct.countDocuments({ platform: 'curseduca' })
  const withIsPrimary = await UserProduct.countDocuments({ 
    platform: 'curseduca',
    isPrimary: { $exists: true }
  })
  const withIsPrimaryTrue = await UserProduct.countDocuments({ 
    platform: 'curseduca',
    isPrimary: true
  })
  const withIsPrimaryFalse = await UserProduct.countDocuments({ 
    platform: 'curseduca',
    isPrimary: false
  })
  
  console.log(`   📦 Total UserProducts CursEDuca: ${totalCurseduca}`)
  console.log(`   ✅ Com isPrimary definido: ${withIsPrimary}`)
  console.log(`   🟢 isPrimary=true: ${withIsPrimaryTrue}`)
  console.log(`   🔴 isPrimary=false: ${withIsPrimaryFalse}`)
  console.log(`   ⚠️  isPrimary undefined: ${totalCurseduca - withIsPrimary}\n`)
  
  if (withIsPrimary === totalCurseduca) {
    console.log('✅ Todos os UserProducts já têm isPrimary definido!')
    console.log('✅ Nenhuma correção necessária.\n')
    await mongoose.disconnect()
    return
  }
  
  // 2. Re-sync CursEDuca (✅ CORRIGIDO: GET em vez de POST)
  console.log('🔄 INICIANDO RE-SYNC CURSEDUCA...')
  console.log('-'.repeat(70))
  
  try {
    // ✅ CORRIGIDO: GET em vez de POST
    const response = await axios.get('http://localhost:3001/api/curseduca/sync/universal')
    
    if (response.status === 200) {
      console.log('✅ Re-sync concluído com sucesso!')
      console.log(`   ⏱️  Duração: ${response.data?.duration || '?'}s`)
      console.log(`   📊 Inseridos: ${response.data?.inserted || 0}`)
      console.log(`   🔄 Atualizados: ${response.data?.updated || 0}\n`)
    } else {
      console.warn(`⚠️  Re-sync retornou status: ${response.status}\n`)
    }
  } catch (error: any) {
    console.error(`❌ Erro no re-sync: ${error.message}`)
    
    if (error.response) {
      console.error(`   Status: ${error.response.status}`)
      console.error(`   URL: ${error.config?.url || 'unknown'}`)
    }
    
    console.warn('\n⚠️  Tentando validar mesmo assim...\n')
  }
  
  // 3. Aguardar um pouco para garantir que BD foi atualizado
  console.log('⏳ Aguardando 5 segundos para BD atualizar...\n')
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  // 4. Verificar estado DEPOIS
  console.log('📊 ESTADO DEPOIS DO RE-SYNC:')
  console.log('-'.repeat(70))
  
  const totalAfter = await UserProduct.countDocuments({ platform: 'curseduca' })
  const withIsPrimaryAfter = await UserProduct.countDocuments({ 
    platform: 'curseduca',
    isPrimary: { $exists: true }
  })
  const withIsPrimaryTrueAfter = await UserProduct.countDocuments({ 
    platform: 'curseduca',
    isPrimary: true
  })
  const withIsPrimaryFalseAfter = await UserProduct.countDocuments({ 
    platform: 'curseduca',
    isPrimary: false
  })
  
  console.log(`   📦 Total UserProducts CursEDuca: ${totalAfter}`)
  console.log(`   ✅ Com isPrimary definido: ${withIsPrimaryAfter}`)
  console.log(`   🟢 isPrimary=true: ${withIsPrimaryTrueAfter}`)
  console.log(`   🔴 isPrimary=false: ${withIsPrimaryFalseAfter}`)
  console.log(`   ⚠️  isPrimary undefined: ${totalAfter - withIsPrimaryAfter}\n`)
  
  // 5. Resultado
  console.log('═'.repeat(70))
  
  if (withIsPrimaryAfter === totalAfter) {
    console.log('✅ CORREÇÃO CONCLUÍDA COM SUCESSO!')
    console.log(`✅ ${totalAfter} UserProducts CursEDuca com isPrimary definido`)
    console.log(`✅ ${withIsPrimaryTrueAfter} produtos primários (users únicos)`)
    console.log(`✅ ${withIsPrimaryFalseAfter} produtos secundários (duplicados)`)
  } else {
    console.log('⚠️  AINDA EXISTEM UserProducts SEM isPrimary')
    console.log(`⚠️  ${totalAfter - withIsPrimaryAfter} UserProducts precisam correção`)
    console.log('\n💡 SOLUÇÃO MANUAL (MongoDB):')
    console.log('   1. Conectar ao MongoDB Compass')
    console.log('   2. Abrir coleção "userproducts"')
    console.log('   3. Executar agregação:')
    console.log('')
    console.log('   db.userproducts.updateMany(')
    console.log('     { platform: "curseduca", isPrimary: { $exists: false } },')
    console.log('     { $set: { isPrimary: true } }')
    console.log('   )')
  }
  
  console.log('═'.repeat(70) + '\n')
  
  // 6. Mostrar exemplos (✅ CORRIGIDO: sem populate)
  console.log('📋 EXEMPLOS DE UserProducts:')
  console.log('-'.repeat(70))
  
  const examples = await UserProduct.find({ platform: 'curseduca' })
    .limit(5)
    .lean()
  
  for (const up of examples) {
    // Buscar email manualmente
    const user = await User.findById(up.userId).select('email').lean()
    const email = user?.email || 'unknown'
    
    console.log(`   📧 ${email}`)
    console.log(`      isPrimary: ${up.isPrimary ?? 'undefined'}`)
    console.log(`      Progress: ${up.progress?.percentage || 0}%`)
    console.log(`      Engagement: ${up.engagement?.engagementScore || 0}`)
    console.log('')
  }
  
  await mongoose.disconnect()
}

fixIsPrimary()