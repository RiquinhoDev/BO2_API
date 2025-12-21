// ════════════════════════════════════════════════════════════
// 🔥 RESET COMPLETO + SYNC FRESH + VALIDAÇÃO
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import UserProduct from '../src/models/UserProduct'
import User from '../src/models/user'
import axios from 'axios'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

async function resetAndSync() {
  await mongoose.connect(MONGODB_URI)
  
  console.log('\n🔥 ════════════════════════════════════════════════════════════')
  console.log('🔥 RESET COMPLETO + SYNC FRESH')
  console.log('🔥 ════════════════════════════════════════════════════════════\n')
  
  // ═══════════════════════════════════════════════════════════
  // STEP 1: BACKUP + DELETE
  // ═══════════════════════════════════════════════════════════
  
  console.log('📊 PASSO 1: Estado ANTES do reset')
  console.log('-'.repeat(70))
  
  const beforeCount = await UserProduct.countDocuments({ platform: 'curseduca' })
  console.log(`   📦 UserProducts CursEDuca: ${beforeCount}`)
  
  if (beforeCount === 0) {
    console.log('   ℹ️  Nenhum UserProduct para apagar\n')
  } else {
    console.log(`\n🗑️  PASSO 2: Apagando ${beforeCount} UserProducts...`)
    console.log('-'.repeat(70))
    
    const deleteResult = await UserProduct.deleteMany({ platform: 'curseduca' })
    console.log(`   ✅ ${deleteResult.deletedCount} UserProducts apagados\n`)
  }
  
  // ═══════════════════════════════════════════════════════════
  // STEP 2: LIMPAR DADOS DOS USERS (opcional mas recomendado)
  // ═══════════════════════════════════════════════════════════
  
  console.log('🧹 PASSO 3: Limpando dados CursEDuca dos Users...')
  console.log('-'.repeat(70))
  
  const updateResult = await User.updateMany(
    { 'curseduca.curseducaUserId': { $exists: true } },
    { $unset: { curseduca: '' } }
  )
  
  console.log(`   ✅ ${updateResult.modifiedCount} users limpos\n`)
  
  // ═══════════════════════════════════════════════════════════
  // STEP 3: SYNC FRESH
  // ═══════════════════════════════════════════════════════════
  
  console.log('🔄 PASSO 4: Iniciando SYNC FRESH...')
  console.log('-'.repeat(70))
  
  try {
    const response = await axios.get('http://localhost:3001/api/curseduca/sync/universal')
    
    if (response.status === 200) {
      console.log('✅ Sync concluído!')
      console.log(`   ⏱️  Duração: ${response.data?.duration || '?'}s`)
      console.log(`   ✅ Inseridos: ${response.data?.inserted || 0}`)
      console.log(`   🔄 Atualizados: ${response.data?.updated || 0}\n`)
    }
  } catch (error: any) {
    console.error(`❌ Erro no sync: ${error.message}`)
    
    if (error.response) {
      console.error(`   Status: ${error.response.status}`)
      console.error(`   Mensagem: ${error.response.data?.message || 'Sem detalhes'}`)
    }
    
    console.log('\n⚠️  Continuando validação mesmo assim...\n')
  }
  
  // ═══════════════════════════════════════════════════════════
  // STEP 4: AGUARDAR
  // ═══════════════════════════════════════════════════════════
  
  console.log('⏳ PASSO 5: Aguardando 5 segundos...\n')
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  // ═══════════════════════════════════════════════════════════
  // STEP 5: VALIDAÇÃO DETALHADA
  // ═══════════════════════════════════════════════════════════
  
  console.log('✅ PASSO 6: VALIDAÇÃO FINAL')
  console.log('═'.repeat(70))
  
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
    })
  }
  
  console.log('\n📊 ESTATÍSTICAS:')
  console.log('-'.repeat(70))
  console.log(`   📦 Total UserProducts: ${stats.total}`)
  console.log(`   ✅ Com isPrimary: ${stats.withIsPrimary}`)
  console.log(`   🟢 isPrimary=true: ${stats.isPrimaryTrue}`)
  console.log(`   🔴 isPrimary=false: ${stats.isPrimaryFalse}`)
  console.log(`   ⚠️  isPrimary=undefined: ${stats.total - stats.withIsPrimary}\n`)
  
  // Exemplos
  console.log('📋 EXEMPLOS (5 UserProducts):')
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
  // STEP 6: RESULTADO FINAL
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n' + '═'.repeat(70))
  console.log('🎯 RESULTADO FINAL')
  console.log('═'.repeat(70) + '\n')
  
  const percentageDefined = Math.round((stats.withIsPrimary / stats.total) * 100)
  
  if (percentageDefined === 100 && stats.isPrimaryTrue > 0) {
    console.log('✅ PERFEITO! 100% dos UserProducts têm isPrimary definido')
    console.log(`✅ ${stats.isPrimaryTrue} produtos primários`)
    console.log(`✅ ${stats.isPrimaryFalse} produtos secundários`)
    console.log('\n🎉 SISTEMA 100% FUNCIONAL! Pronto para CRON jobs!\n')
  } else if (percentageDefined >= 95) {
    console.log(`✅ BOM! ${percentageDefined}% dos UserProducts têm isPrimary`)
    console.log(`⚠️  ${stats.total - stats.withIsPrimary} ainda sem isPrimary\n`)
  } else {
    console.log(`❌ PROBLEMA! Apenas ${percentageDefined}% têm isPrimary`)
    console.log('\n💡 DIAGNÓSTICO:')
    
    if (stats.total === 0) {
      console.log('   ❌ Nenhum UserProduct criado - Sync falhou!')
      console.log('   💡 Verificar logs do sync acima')
    } else if (stats.withIsPrimary === 0) {
      console.log('   ❌ UserProducts criados mas SEM isPrimary')
      console.log('   💡 Problema no universalSyncService.ts')
      console.log('   💡 Linha: isPrimary: item.platformData?.isPrimary ?? true')
    } else {
      console.log('   ⚠️  Alguns UserProducts têm isPrimary, outros não')
      console.log('   💡 Possível problema parcial no sync')
    }
    
    console.log('')
  }
  
  console.log('═'.repeat(70) + '\n')
  
  await mongoose.disconnect()
}

resetAndSync()