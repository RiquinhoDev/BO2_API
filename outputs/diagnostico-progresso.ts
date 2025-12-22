// ════════════════════════════════════════════════════════════
// 🔍 DIAGNÓSTICO COMPLETO - PROGRESSO DOS ALUNOS
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import Product from '../src/models/Product'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

async function diagnosticarProgresso() {
  await mongoose.connect(MONGODB_URI)
  
  console.log('\n🔍 ════════════════════════════════════════════════════════════')
  console.log('🔍 DIAGNÓSTICO COMPLETO - PROGRESSO DOS ALUNOS')
  console.log('🔍 ════════════════════════════════════════════════════════════\n')
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 1: VERIFICAR USERPRODUCTS (source of truth)
  // ═══════════════════════════════════════════════════════════
  
  console.log('📊 PASSO 1: UserProducts - Fonte de verdade')
  console.log('-'.repeat(70))
  
  const totalUP = await UserProduct.countDocuments()
  const withProgress = await UserProduct.countDocuments({ 'progress.percentage': { $exists: true, $gt: 0 } })
  const withZeroProgress = await UserProduct.countDocuments({ 'progress.percentage': 0 })
  const noProgress = await UserProduct.countDocuments({ 'progress.percentage': { $exists: false } })
  
  console.log(`   📦 Total UserProducts: ${totalUP}`)
  console.log(`   ✅ Com progresso > 0: ${withProgress}`)
  console.log(`   ⚠️  Com progresso = 0: ${withZeroProgress}`)
  console.log(`   ❌ Sem campo progress: ${noProgress}`)
  
  // Amostras
  console.log('\n   📋 AMOSTRAS (UserProducts com progresso):')
  const samplesWithProgress = await UserProduct.find({ 
    'progress.percentage': { $exists: true, $gt: 0 } 
  })
    .populate('userId', 'email name')
    .limit(5)
    .lean()
  
  for (const up of samplesWithProgress) {
    const user = up.userId as any
    console.log(`   ${samplesWithProgress.indexOf(up) + 1}. ${user?.email || 'N/A'}`)
    console.log(`      Platform: ${up.platform}`)
    console.log(`      Progresso: ${up.progress?.percentage || 0}%`)
    console.log(`      Engagement: ${up.engagement?.engagementScore || 0}`)
  }
  
  console.log('\n   📋 AMOSTRAS (UserProducts SEM progresso):')
  const samplesNoProgress = await UserProduct.find({ 
    $or: [
      { 'progress.percentage': 0 },
      { 'progress.percentage': { $exists: false } }
    ]
  })
    .populate('userId', 'email name')
    .limit(5)
    .lean()
  
  for (const up of samplesNoProgress) {
    const user = up.userId as any
    console.log(`   ${samplesNoProgress.indexOf(up) + 1}. ${user?.email || 'N/A'}`)
    console.log(`      Platform: ${up.platform}`)
    console.log(`      Progresso: ${up.progress?.percentage ?? 'undefined'}`)
    console.log(`      Engagement: ${up.engagement?.engagementScore || 0}`)
  }
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 2: VERIFICAR USER SCHEMA (dados antigos?)
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n📊 PASSO 2: User Schema - Dados segregados')
  console.log('-'.repeat(70))
  
  // Hotmart
  const hotmartWithProgress = await User.countDocuments({ 
    'hotmart.progress.totalProgress': { $exists: true, $gt: 0 } 
  })
  console.log(`   🔥 Hotmart com progress: ${hotmartWithProgress}`)
  
  const hotmartSample = await User.findOne({ 
    'hotmart.progress.totalProgress': { $exists: true, $gt: 0 } 
  })
    .select('email hotmart.progress')
    .lean()
  
  if (hotmartSample) {
    console.log(`      Exemplo: ${hotmartSample.email}`)
    console.log(`      Progress: ${(hotmartSample as any).hotmart?.progress?.totalProgress || 0}%`)
  }
  
  // CursEDuca
  const curseducaWithProgress = await User.countDocuments({ 
    'curseduca.progress.estimatedProgress': { $exists: true, $gt: 0 } 
  })
  console.log(`   📚 CursEDuca com progress: ${curseducaWithProgress}`)
  
  const curseducaSample = await User.findOne({ 
    'curseduca.progress.estimatedProgress': { $exists: true, $gt: 0 } 
  })
    .select('email curseduca.progress')
    .lean()
  
  if (curseducaSample) {
    console.log(`      Exemplo: ${curseducaSample.email}`)
    console.log(`      Progress: ${(curseducaSample as any).curseduca?.progress?.estimatedProgress || 0}%`)
  }
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 3: VERIFICAR EMAILS ESPECÍFICOS DA IMAGEM
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n📊 PASSO 3: Users da imagem')
  console.log('-'.repeat(70))
  
  const emails = [
    'andregaspar1996@gmail.com',
    'jcarmovaz@gmail.com',
    'joaopmgomes.1995@gmail.com',
    'francinamoreira@sapo.pt',
    'antlusilva@gmail.com'
  ]
  
  for (const email of emails) {
    console.log(`\n   🔍 ${email}`)
    
    // Buscar User
    const user = await User.findOne({ email }).lean()
    
    if (!user) {
      console.log(`      ❌ User não encontrado!`)
      continue
    }
    
    console.log(`      ✅ User encontrado`)
    
    // Buscar UserProducts
    const userProducts = await UserProduct.find({ userId: user._id })
      .lean()
    
    console.log(`      📦 ${userProducts.length} UserProduct(s)`)
    
    userProducts.forEach((up: any, i: number) => {
      console.log(`      ${i + 1}. Platform: ${up.platform || 'N/A'}`)
      console.log(`         Progress: ${up.progress?.percentage ?? 'undefined'}%`)
      console.log(`         Engagement: ${up.engagement?.engagementScore || 0}`)
      console.log(`         Status: ${up.status}`)
      console.log(`         isPrimary: ${up.isPrimary ?? 'undefined'}`)
    })
    
    // Verificar dados antigos no User
    const userData = user as any
    
    if (userData.hotmart?.progress?.totalProgress) {
      console.log(`      🔥 Hotmart (schema antigo): ${userData.hotmart.progress.totalProgress}%`)
    }
    
    if (userData.curseduca?.progress?.estimatedProgress) {
      console.log(`      📚 CursEDuca (schema antigo): ${userData.curseduca.progress.estimatedProgress}%`)
    }
    
    if (userData.discord) {
      console.log(`      💬 Discord: Sem progresso (esperado)`)
    }
  }
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 4: QUERY QUE O FRONTEND USA
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n📊 PASSO 4: Simular query do frontend')
  console.log('-'.repeat(70))
  
  // Simular endpoint /api/users/v2
  const pipeline = [
    // Stage 1: Match users ativos
    { $match: { 'combined.status': 'ACTIVE' } },
    
    // Stage 2: Lookup UserProducts
    {
      $lookup: {
        from: 'userproducts',
        localField: '_id',
        foreignField: 'userId',
        as: 'products'
      }
    },
    
    // Stage 3: Limit 5 para teste
    { $limit: 5 }
  ]
  
  const results = await User.aggregate(pipeline)
  
  console.log(`   📊 Resultado da query (5 primeiros):`)
  
  results.forEach((user: any, i: number) => {
    console.log(`\n   ${i + 1}. ${user.email}`)
    console.log(`      Products: ${user.products?.length || 0}`)
    
    if (user.products && user.products.length > 0) {
      user.products.forEach((p: any, j: number) => {
        console.log(`      ${j + 1}. Platform: ${p.platform}`)
        console.log(`         Progress: ${p.progress?.percentage ?? 'undefined'}%`)
        console.log(`         Engagement: ${p.engagement?.engagementScore || 0}`)
      })
    }
  })
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 5: DIAGNÓSTICO FINAL
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n' + '═'.repeat(70))
  console.log('🎯 DIAGNÓSTICO FINAL')
  console.log('═'.repeat(70) + '\n')
  
  const percentWithProgress = totalUP > 0 ? Math.round((withProgress / totalUP) * 100) : 0
  
  if (percentWithProgress === 0) {
    console.log('❌ PROBLEMA CRÍTICO: Nenhum UserProduct tem progresso!')
    console.log('\n💡 POSSÍVEIS CAUSAS:')
    console.log('   1. Sync não está a copiar dados de User para UserProduct')
    console.log('   2. Campo progress.percentage não está no schema UserProduct')
    console.log('   3. Dados só existem no User (schema antigo)')
    console.log('\n🔧 SOLUÇÃO:')
    console.log('   Executar script de migração para copiar progress de User → UserProduct')
  } else if (percentWithProgress < 50) {
    console.log(`⚠️  PROBLEMA PARCIAL: Apenas ${percentWithProgress}% têm progresso`)
    console.log('\n💡 POSSÍVEL CAUSA:')
    console.log('   Algumas plataformas não têm progresso (ex: Discord)')
    console.log('\n🔧 SOLUÇÃO:')
    console.log('   Verificar por plataforma e sincronizar dados em falta')
  } else {
    console.log(`✅ DADOS OK: ${percentWithProgress}% dos UserProducts têm progresso`)
    console.log('\n💡 SE O FRONTEND AINDA MOSTRA 0%:')
    console.log('   1. Verificar query do endpoint /api/users/v2')
    console.log('   2. Verificar se frontend está a ler products[].progress.percentage')
    console.log('   3. Verificar populate no backend')
  }
  
  console.log('\n' + '═'.repeat(70) + '\n')
  
  await mongoose.disconnect()
}

diagnosticarProgresso()