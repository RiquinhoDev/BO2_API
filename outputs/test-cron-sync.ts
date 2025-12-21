// ════════════════════════════════════════════════════════════
// 🧪 TESTE CRON COMPLETO - CORRIGIDO
// ════════════════════════════════════════════════════════════
// Script para testar sync completo via CRON
// Executa 2 minutos depois e verifica TODOS os dados

import mongoose from 'mongoose'
import CronJobConfig from '../src/models/SyncModels/CronJobConfig'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'

async function testCronSync() {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'
  await mongoose.connect(MONGODB_URI)
  
  console.log('🧪 CRIANDO JOB DE TESTE (executa em 2 minutos)...\n')

  try {
    // ✅ CRIAR ADMIN ID (obrigatório) - usar ID de admin existente ou criar fake
    const adminId = new mongoose.Types.ObjectId('000000000000000000000001')

    // Calcular nextRun (2 minutos depois)
    const now = new Date()
    const in2min = new Date(now.getTime() + 2 * 60 * 1000)
    const in3min = new Date(now.getTime() + 3 * 60 * 1000)
    
    // 1. Criar job Hotmart
    const hotmartJob = await CronJobConfig.create({
      name: 'TEST_HOTMART_SYNC',
      description: 'Teste de sync Hotmart com dados completos',
      syncType: 'hotmart',
      
      // ✅ CAMPO OBRIGATÓRIO: schedule
      schedule: {
        cronExpression: `${in2min.getMinutes()} ${in2min.getHours()} * * *`,
        timezone: 'Europe/Lisbon',
        enabled: true
      },
      
      // ✅ CAMPO OBRIGATÓRIO: syncConfig
      syncConfig: {
        fullSync: true,
        includeProgress: true,
        includeTags: false,
        batchSize: 50
      },
      
      // Opcional mas recomendado
      notifications: {
        enabled: false,
        emailOnSuccess: false,
        emailOnFailure: false,
        recipients: []
      },
      
      retryPolicy: {
        maxRetries: 0,
        retryDelayMinutes: 5,
        exponentialBackoff: false
      },
      
      // ✅ CAMPO OBRIGATÓRIO: createdBy
      createdBy: adminId,
      
      // Opcional
      isActive: true,
      nextRun: in2min
    })
    
    // 2. Criar job CursEDuca
    const curseducaJob = await CronJobConfig.create({
      name: 'TEST_CURSEDUCA_SYNC',
      description: 'Teste de sync CursEDuca com dados completos',
      syncType: 'curseduca',
      
      schedule: {
        cronExpression: `${in3min.getMinutes()} ${in3min.getHours()} * * *`,
        timezone: 'Europe/Lisbon',
        enabled: true
      },
      
      syncConfig: {
        fullSync: true,
        includeProgress: true,
        includeTags: false,
        batchSize: 50
      },
      
      notifications: {
        enabled: false,
        emailOnSuccess: false,
        emailOnFailure: false,
        recipients: []
      },
      
      retryPolicy: {
        maxRetries: 0,
        retryDelayMinutes: 5,
        exponentialBackoff: false
      },
      
      createdBy: adminId,
      isActive: true,
      nextRun: in3min
    })
    
    console.log(`✅ Jobs criados:`)
    console.log(`   🔥 Hotmart: ${hotmartJob._id}`)
    console.log(`      Executa: ${in2min.toLocaleTimeString('pt-PT')}`)
    console.log(`   📚 CursEDuca: ${curseducaJob._id}`)
    console.log(`      Executa: ${in3min.toLocaleTimeString('pt-PT')}\n`)
    
    // ═══════════════════════════════════════════════════════════
    // AGUARDAR EXECUÇÃO (5 minutos)
    // ═══════════════════════════════════════════════════════════
    console.log('⏰ Aguardando execução dos jobs...\n')
    console.log('   [Aguarda 5 minutos para garantir que ambos executaram]\n')

    // Countdown visual
    for (let i = 5; i > 0; i--) {
      process.stdout.write(`   ⏳ ${i} minuto(s) restante(s)...   \r`)
      await new Promise(resolve => setTimeout(resolve, 60 * 1000))
    }

    console.log('\n\n✅ Tempo decorrido! Verificando resultados...\n')

    // ═══════════════════════════════════════════════════════════
    // VERIFICAR RESULTADOS
    // ═══════════════════════════════════════════════════════════
    console.log('═'.repeat(60))
    console.log('📊 VERIFICAÇÃO DE DADOS')
    console.log('═'.repeat(60) + '\n')

    // Stats gerais
    const totalUsers = await User.countDocuments()
    const hotmartUsers = await User.countDocuments({ 'hotmart.hotmartUserId': { $exists: true, $ne: null } })
    const curseducaUsers = await User.countDocuments({ 'curseduca.curseducaUserId': { $exists: true, $ne: null } })
    const totalUserProducts = await UserProduct.countDocuments()

    console.log('🔢 STATS GERAIS:')
    console.log(`   Total Users: ${totalUsers}`)
    console.log(`   Hotmart: ${hotmartUsers}`)
    console.log(`   CursEDuca: ${curseducaUsers}`)
    console.log(`   UserProducts: ${totalUserProducts}\n`)

    // Validação de números esperados
    console.log('✅ VALIDAÇÃO:')
    console.log(`   Hotmart esperado: 4253, obtido: ${hotmartUsers} ${hotmartUsers === 4253 ? '✅' : '❌'}`)
    console.log(`   CursEDuca esperado: 324, obtido: ${curseducaUsers} ${curseducaUsers === 324 ? '✅' : '❌'}\n`)

    // ═══════════════════════════════════════════════════════════
    // VERIFICAR DADOS HOTMART (EXEMPLO)
    // ═══════════════════════════════════════════════════════════
    console.log('═'.repeat(60))
    console.log('🔥 HOTMART - VERIFICAÇÃO DETALHADA')
    console.log('═'.repeat(60) + '\n')

    const hotmartSample = await User.findOne({ 
      'hotmart.hotmartUserId': { $exists: true } 
    })

    if (hotmartSample) {
      console.log(`📧 User exemplo: ${hotmartSample.email}\n`)

      // Campos obrigatórios
      const checks = {
        'hotmartUserId': hotmartSample.hotmart?.hotmartUserId,
        'purchaseDate': hotmartSample.hotmart?.purchaseDate,
        'signupDate': hotmartSample.hotmart?.signupDate,
        'firstAccessDate': hotmartSample.hotmart?.firstAccessDate,
        'lastAccessDate': hotmartSample.hotmart?.progress?.lastAccessDate,
        'accessCount': hotmartSample.hotmart?.engagement?.accessCount,
        'completedLessons': hotmartSample.hotmart?.progress?.completedLessons,
        'lessonsData': hotmartSample.hotmart?.progress?.lessonsData?.length,
        'engagementScore': hotmartSample.hotmart?.engagement?.engagementScore,
        'engagementLevel': hotmartSample.hotmart?.engagement?.engagementLevel
      }

      console.log('🔍 Campos populados:')
      for (const [field, value] of Object.entries(checks)) {
        const status = value !== undefined && value !== null && value !== 0 ? '✅' : '❌'
        console.log(`   ${status} ${field}: ${value || 'VAZIO'}`)
      }

      // UserProduct
      const userProduct = await UserProduct.findOne({ userId: hotmartSample._id })
      if (userProduct) {
        console.log('\n📦 UserProduct:')
        console.log(`   ✅ Existe`)
        console.log(`   Progress %: ${userProduct.progress?.percentage || 0}`)
        console.log(`   Engagement Score: ${userProduct.engagement?.engagementScore || 0}`)
        console.log(`   Last Activity: ${userProduct.progress?.lastActivity || 'null'}`)
      } else {
        console.log('\n❌ UserProduct NÃO ENCONTRADO!')
      }
    }

    // ═══════════════════════════════════════════════════════════
    // VERIFICAR DADOS CURSEDUCA (EXEMPLO)
    // ═══════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60))
    console.log('📚 CURSEDUCA - VERIFICAÇÃO DETALHADA')
    console.log('═'.repeat(60) + '\n')

    const curseducaSample = await User.findOne({ 
      'curseduca.curseducaUserId': { $exists: true } 
    })

    if (curseducaSample) {
      console.log(`📧 User exemplo: ${curseducaSample.email}\n`)

      const checks = {
        'curseducaUserId': curseducaSample.curseduca?.curseducaUserId,
        'curseducaUuid': curseducaSample.curseduca?.curseducaUuid,
        'groupId': curseducaSample.curseduca?.groupId,
        'groupName': curseducaSample.curseduca?.groupName,
        'joinedDate': curseducaSample.curseduca?.joinedDate,
        'estimatedProgress': curseducaSample.curseduca?.progress?.estimatedProgress,
        'alternativeEngagement': curseducaSample.curseduca?.engagement?.alternativeEngagement
      }

      console.log('🔍 Campos populados:')
      for (const [field, value] of Object.entries(checks)) {
        const status = value !== undefined && value !== null && value !== 0 ? '✅' : '❌'
        console.log(`   ${status} ${field}: ${value || 'VAZIO'}`)
      }

      // UserProduct
      const userProduct = await UserProduct.findOne({ 
        userId: curseducaSample._id,
        platform: 'curseduca'
      })
      if (userProduct) {
        console.log('\n📦 UserProduct:')
        console.log(`   ✅ Existe`)
        console.log(`   Progress %: ${userProduct.progress?.percentage || 0}`)
        console.log(`   Engagement Score: ${userProduct.engagement?.engagementScore || 0}`)
      } else {
        console.log('\n❌ UserProduct NÃO ENCONTRADO!')
      }
    }

    // ═══════════════════════════════════════════════════════════
    // STATS DE DADOS POPULADOS
    // ═══════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60))
    console.log('📈 STATS DE QUALIDADE DOS DADOS')
    console.log('═'.repeat(60) + '\n')

    const qualityStats = {
      hotmartWithProgress: await User.countDocuments({ 
        'hotmart.progress.completedLessons': { $gt: 0 } 
      }),
      hotmartWithEngagement: await User.countDocuments({ 
        'hotmart.engagement.accessCount': { $gt: 0 } 
      }),
      hotmartWithLessons: await User.countDocuments({ 
        'hotmart.progress.lessonsData.0': { $exists: true } 
      }),
      curseducaWithProgress: await User.countDocuments({ 
        'curseduca.progress.estimatedProgress': { $gt: 0 } 
      }),
      userProductsWithProgress: await UserProduct.countDocuments({ 
        'progress.percentage': { $gt: 0 } 
      }),
      userProductsWithEngagement: await UserProduct.countDocuments({ 
        'engagement.engagementScore': { $gt: 0 } 
      })
    }

    console.log('🔥 Hotmart:')
    console.log(`   Com progresso: ${qualityStats.hotmartWithProgress}`)
    console.log(`   Com engagement: ${qualityStats.hotmartWithEngagement}`)
    console.log(`   Com lições: ${qualityStats.hotmartWithLessons}`)

    console.log('\n📚 CursEDuca:')
    console.log(`   Com progresso: ${qualityStats.curseducaWithProgress}`)

    console.log('\n📦 UserProducts:')
    console.log(`   Com progresso: ${qualityStats.userProductsWithProgress}`)
    console.log(`   Com engagement: ${qualityStats.userProductsWithEngagement}`)

    // ═══════════════════════════════════════════════════════════
    // RESULTADO FINAL
    // ═══════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60))
    console.log('🎯 RESULTADO FINAL')
    console.log('═'.repeat(60) + '\n')

    const allChecksPassed = 
      hotmartUsers === 4253 &&
      curseducaUsers === 324 &&
      qualityStats.hotmartWithEngagement > 0 &&
      qualityStats.hotmartWithProgress > 0 &&
      qualityStats.userProductsWithProgress > 0

    if (allChecksPassed) {
      console.log('✅ TODOS OS TESTES PASSARAM!')
      console.log('   - Números corretos ✅')
      console.log('   - Dados populados ✅')
      console.log('   - UserProducts criados ✅\n')
    } else {
      console.log('❌ ALGUNS TESTES FALHARAM:')
      if (hotmartUsers !== 4253) console.log(`   - Hotmart: esperado 4253, obtido ${hotmartUsers}`)
      if (curseducaUsers !== 324) console.log(`   - CursEDuca: esperado 324, obtido ${curseducaUsers}`)
      if (qualityStats.hotmartWithEngagement === 0) console.log(`   - Hotmart sem engagement`)
      if (qualityStats.hotmartWithProgress === 0) console.log(`   - Hotmart sem progresso`)
      if (qualityStats.userProductsWithProgress === 0) console.log(`   - UserProducts sem dados`)
      console.log('')
    }

    // ═══════════════════════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════════════════════
    console.log('🧹 Limpando jobs de teste...\n')
    await CronJobConfig.deleteMany({ name: { $regex: /^TEST_/ } })
    console.log('✅ Jobs removidos\n')

  } catch (error: any) {
    console.error('\n❌ Erro:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('✅ Desconectado do MongoDB\n')
  }
}

testCronSync()