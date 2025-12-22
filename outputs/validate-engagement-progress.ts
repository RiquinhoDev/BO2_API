// ════════════════════════════════════════════════════════════
// 🔍 VALIDAÇÃO COMPLETA - ENGAGEMENT E PROGRESSO MÉDIOS
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import UserProduct from '../src/models/UserProduct'
import User from '../src/models/user'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

async function validateStats() {
  await mongoose.connect(MONGODB_URI)
  
  console.log('\n🔍 ════════════════════════════════════════════════════════════')
  console.log('🔍 VALIDAÇÃO COMPLETA - ENGAGEMENT E PROGRESSO MÉDIOS')
  console.log('🔍 ════════════════════════════════════════════════════════════\n')
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 1: BUSCAR USERPRODUCTS ATIVOS
  // ═══════════════════════════════════════════════════════════
  
  console.log('📊 PASSO 1: UserProducts ACTIVE')
  console.log('-'.repeat(70))
  
  const activeUPs = await UserProduct.find({ status: 'ACTIVE' })
    .populate('userId', 'email name')
    .lean()
  
  console.log(`   📦 Total UserProducts ACTIVE: ${activeUPs.length}`)
  
  // Breakdown por plataforma
  const byPlatform = new Map<string, any[]>()
  activeUPs.forEach((up: any) => {
    const platform = up.platform || 'unknown'
    if (!byPlatform.has(platform)) byPlatform.set(platform, [])
    byPlatform.get(platform)!.push(up)
  })
  
  console.log('\n   📊 Breakdown por plataforma:')
  byPlatform.forEach((ups, platform) => {
    console.log(`   - ${platform}: ${ups.length} UserProducts`)
  })
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 2: AGRUPAR POR USER (USERS ÚNICOS)
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n📊 PASSO 2: Agrupar por User (USERS ÚNICOS)')
  console.log('-'.repeat(70))
  
  const byUser = new Map<string, any[]>()
  
  activeUPs.forEach((up: any) => {
    const userId = up.userId?._id?.toString() || up.userId?.toString()
    if (!userId) return
    
    if (!byUser.has(userId)) byUser.set(userId, [])
    byUser.get(userId)!.push(up)
  })
  
  const uniqueUsers = byUser.size
  console.log(`   👥 Users únicos: ${uniqueUsers}`)
  
  // Verificar users com múltiplos produtos
  const multiProduct = Array.from(byUser.values()).filter(ups => ups.length > 1)
  console.log(`   📦 Users com múltiplos produtos: ${multiProduct.length}`)
  
  if (multiProduct.length > 0) {
    console.log('\n   📋 Exemplos (primeiros 5):')
    multiProduct.slice(0, 5).forEach((ups, i) => {
      const user = ups[0].userId
      console.log(`   ${i + 1}. ${user?.email || 'N/A'} - ${ups.length} produtos`)
      ups.forEach((up: any) => {
        console.log(`      → ${up.platform || 'N/A'}`)
        console.log(`         Engagement: ${up.engagement?.engagementScore || 0}`)
        console.log(`         Progresso: ${up.progress?.percentage || 0}%`)
      })
    })
  }
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 3: CALCULAR ENGAGEMENT MÉDIO (POR USER)
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n📊 PASSO 3: ENGAGEMENT MÉDIO (média por user)')
  console.log('-'.repeat(70))
  
  let totalEngagement = 0
  let usersWithEngagement = 0
  
  const engagementByPlatform = new Map<string, { sum: number; count: number }>()
  
  byUser.forEach((ups, userId) => {
    // Calcular engagement médio DESTE user (média dos seus produtos)
    const userEngagements = ups
      .map((up: any) => up.engagement?.engagementScore || 0)
      .filter(e => e > 0)
    
    if (userEngagements.length === 0) return
    
    const userAvgEngagement = userEngagements.reduce((sum, e) => sum + e, 0) / userEngagements.length
    
    totalEngagement += userAvgEngagement
    usersWithEngagement++
    
    // Breakdown por plataforma
    ups.forEach((up: any) => {
      const platform = up.platform || 'unknown'
      const engagement = up.engagement?.engagementScore || 0
      
      if (engagement > 0) {
        if (!engagementByPlatform.has(platform)) {
          engagementByPlatform.set(platform, { sum: 0, count: 0 })
        }
        const stats = engagementByPlatform.get(platform)!
        stats.sum += engagement
        stats.count++
      }
    })
  })
  
  const avgEngagement = usersWithEngagement > 0 
    ? totalEngagement / usersWithEngagement 
    : 0
  
  console.log(`   ✅ ENGAGEMENT MÉDIO GERAL: ${avgEngagement.toFixed(1)}`)
  console.log(`   📊 Users com engagement: ${usersWithEngagement} / ${uniqueUsers}`)
  
  console.log('\n   📊 Engagement médio por plataforma:')
  engagementByPlatform.forEach((stats, platform) => {
    const avg = stats.count > 0 ? stats.sum / stats.count : 0
    console.log(`   - ${platform}: ${avg.toFixed(1)} (${stats.count} UserProducts)`)
  })
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 4: CALCULAR PROGRESSO MÉDIO (POR USER)
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n📊 PASSO 4: PROGRESSO MÉDIO (média por user)')
  console.log('-'.repeat(70))
  
  let totalProgress = 0
  let usersWithProgress = 0
  
  const progressByPlatform = new Map<string, { sum: number; count: number }>()
  
  byUser.forEach((ups, userId) => {
    // Calcular progresso médio DESTE user (média dos seus produtos)
    const userProgresses = ups
      .map((up: any) => up.progress?.percentage || 0)
      .filter(p => p >= 0) // Incluir 0% também
    
    if (userProgresses.length === 0) return
    
    const userAvgProgress = userProgresses.reduce((sum, p) => sum + p, 0) / userProgresses.length
    
    totalProgress += userAvgProgress
    usersWithProgress++
    
    // Breakdown por plataforma
    ups.forEach((up: any) => {
      const platform = up.platform || 'unknown'
      const progress = up.progress?.percentage || 0
      
      if (!progressByPlatform.has(platform)) {
        progressByPlatform.set(platform, { sum: 0, count: 0 })
      }
      const stats = progressByPlatform.get(platform)!
      stats.sum += progress
      stats.count++
    })
  })
  
  const avgProgress = usersWithProgress > 0 
    ? totalProgress / usersWithProgress 
    : 0
  
  console.log(`   ✅ PROGRESSO MÉDIO GERAL: ${avgProgress.toFixed(1)}%`)
  console.log(`   📊 Users com progresso: ${usersWithProgress} / ${uniqueUsers}`)
  
  console.log('\n   📊 Progresso médio por plataforma:')
  progressByPlatform.forEach((stats, platform) => {
    const avg = stats.count > 0 ? stats.sum / stats.count : 0
    console.log(`   - ${platform}: ${avg.toFixed(1)}% (${stats.count} UserProducts)`)
  })
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 5: VERIFICAR FONTE DE DADOS (User schema)
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n📊 PASSO 5: Verificar fonte de dados (User schema)')
  console.log('-'.repeat(70))
  
  // Hotmart
  const usersWithHotmartProgress = await User.countDocuments({
    'hotmart.progress.lessonsData': { $exists: true, $not: { $size: 0 } }
  })
  console.log(`   🔥 Hotmart: ${usersWithHotmartProgress} users com lessonsData`)
  
  const hotmartSample = await User.findOne({
    'hotmart.progress.lessonsData': { $exists: true, $not: { $size: 0 } }
  }).select('email hotmart.progress').lean()
  
  if (hotmartSample) {
    const h = hotmartSample as any
    console.log(`      Exemplo: ${h.email}`)
    console.log(`      Lessons: ${h.hotmart?.progress?.lessonsData?.length || 0}`)
    console.log(`      Completed: ${h.hotmart?.progress?.completedLessons || 0}`)
    console.log(`      Progress: ${h.hotmart?.progress?.completedPercentage || 0}%`)
  }
  
  // CursEDuca
  const usersWithCurseducaProgress = await User.countDocuments({
    'curseduca.progress.estimatedProgress': { $exists: true, $gt: 0 }
  })
  console.log(`\n   📚 CursEDuca: ${usersWithCurseducaProgress} users com estimatedProgress`)
  
  const curseducaSample = await User.findOne({
    'curseduca.progress.estimatedProgress': { $exists: true, $gt: 0 }
  }).select('email curseduca.progress').lean()
  
  if (curseducaSample) {
    const c = curseducaSample as any
    console.log(`      Exemplo: ${c.email}`)
    console.log(`      Progress: ${c.curseduca?.progress?.estimatedProgress || 0}%`)
  }
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 6: COMPARAÇÃO COM DASHBOARD
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n📊 PASSO 6: Comparação com Dashboard')
  console.log('-'.repeat(70))
  
  const dashboardValues = {
    totalAlunos: 4281,
    engagementMedio: 36.0,
    progressoMedio: 2.0
  }
  
  const calculated = {
    totalAlunos: uniqueUsers,
    engagementMedio: Math.round(avgEngagement * 10) / 10,
    progressoMedio: Math.round(avgProgress * 10) / 10
  }
  
  console.log('\n   Dashboard atual:')
  console.log(`   - Total Alunos: ${dashboardValues.totalAlunos}`)
  console.log(`   - Engagement: ${dashboardValues.engagementMedio}`)
  console.log(`   - Progresso: ${dashboardValues.progressoMedio}%`)
  
  console.log('\n   Calculado agora:')
  console.log(`   - Total Alunos: ${calculated.totalAlunos}`)
  console.log(`   - Engagement: ${calculated.engagementMedio}`)
  console.log(`   - Progresso: ${calculated.progressoMedio}%`)
  
  console.log('\n   ✅ Comparação:')
  const matchTotal = calculated.totalAlunos === dashboardValues.totalAlunos
  const matchEng = Math.abs(calculated.engagementMedio - dashboardValues.engagementMedio) < 1
  const matchProg = Math.abs(calculated.progressoMedio - dashboardValues.progressoMedio) < 1
  
  console.log(`   - Total: ${matchTotal ? '✅ MATCH' : '❌ DIFERENTE'}`)
  console.log(`   - Engagement: ${matchEng ? '✅ MATCH' : '❌ DIFERENTE'}`)
  console.log(`   - Progresso: ${matchProg ? '✅ MATCH' : '❌ DIFERENTE'}`)
  
  // ═══════════════════════════════════════════════════════════
  // PASSO 7: VERIFICAR SE CRON VAI BUSCAR DADOS CERTOS
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n📊 PASSO 7: Verificar preparação para CRON 00:00')
  console.log('-'.repeat(70))
  
  // Verificar se UserProducts TÊM dados de progresso
  const upsWithProgress = activeUPs.filter((up: any) => 
    up.progress?.percentage !== undefined && up.progress?.percentage > 0
  )
  
  const percentWithProgress = activeUPs.length > 0
    ? Math.round((upsWithProgress.length / activeUPs.length) * 100)
    : 0
  
  console.log(`   📦 UserProducts com progresso > 0: ${upsWithProgress.length} / ${activeUPs.length} (${percentWithProgress}%)`)
  
  if (percentWithProgress < 20) {
    console.log('   ⚠️  AVISO: Menos de 20% dos UserProducts têm progresso!')
    console.log('   💡 CRON precisa COPIAR dados de User → UserProduct!')
  } else {
    console.log('   ✅ Dados de progresso parecem OK para CRON')
  }
  
  // Verificar se User schema TEM dados
  const usersWithAnyProgress = await User.countDocuments({
    $or: [
      { 'hotmart.progress.completedLessons': { $gt: 0 } },
      { 'curseduca.progress.estimatedProgress': { $gt: 0 } }
    ]
  })
  
  console.log(`\n   👥 Users com progresso no schema: ${usersWithAnyProgress} / ${uniqueUsers}`)
  
  if (usersWithAnyProgress > upsWithProgress.length) {
    console.log('   ⚠️  Dados existem em User mas NÃO em UserProduct!')
    console.log('   💡 CRON deve MIGRAR:')
    console.log(`      User.hotmart.progress → UserProduct.progress`)
    console.log(`      User.curseduca.progress → UserProduct.progress`)
  }
  
  // ═══════════════════════════════════════════════════════════
  // RESULTADO FINAL
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n' + '═'.repeat(70))
  console.log('🎯 RESULTADO FINAL')
  console.log('═'.repeat(70) + '\n')
  
  if (matchTotal && matchEng && matchProg) {
    console.log('✅ PERFEITO! Todos os valores MATCH com o Dashboard!')
  } else {
    console.log('⚠️  DIVERGÊNCIAS ENCONTRADAS:')
    if (!matchTotal) console.log(`   - Total: Dashboard ${dashboardValues.totalAlunos} vs Calculado ${calculated.totalAlunos}`)
    if (!matchEng) console.log(`   - Engagement: Dashboard ${dashboardValues.engagementMedio} vs Calculado ${calculated.engagementMedio}`)
    if (!matchProg) console.log(`   - Progresso: Dashboard ${dashboardValues.progressoMedio}% vs Calculado ${calculated.progressoMedio}%`)
  }
  
  console.log('\n🔮 PREPARAÇÃO CRON (00:00):')
  if (percentWithProgress < 20) {
    console.log('   ❌ UserProducts SEM progresso suficiente')
    console.log('   💡 CRON deve copiar User.progress → UserProduct.progress')
  } else {
    console.log('   ✅ UserProducts TÊM progresso')
    console.log('   ✅ CRON pode atualizar normalmente')
  }
  
  console.log('\n' + '═'.repeat(70) + '\n')
  
  await mongoose.disconnect()
}

validateStats()