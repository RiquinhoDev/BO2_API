// ════════════════════════════════════════════════════════════
// 🏭 SETUP COMPLETO - TESTE SEQUENCIAL + PRODUÇÃO
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"

// ─────────────────────────────────────────────────────────────
// CONFIGURAÇÃO
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  // ✅ ATIVAR TESTE SEQUENCIAL (igual à produção)
  enableTestJobs: true,  // ← true para testar AGORA
  
  // ✅ ATIVAR JOBS DE PRODUÇÃO (00:00 e 00:30)
  enableProductionJobs: true,
  
  // Intervalo entre testes (minutos)
  testInterval: {
    hotmartStartsIn: 200,      // Hotmart começa daqui a 2 min
    curseducaAfterHotmart: 2 // CursEduca 10 min depois (tempo para Hotmart terminar)
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: Calcular hora de execução
// ─────────────────────────────────────────────────────────────

function getTestCronExpression(minutesFromNow: number): { cron: string, targetTime: Date } {
  const now = new Date()
  const targetTime = new Date(now.getTime() + minutesFromNow * 60 * 1000)
  
  const minute = targetTime.getMinutes()
  const hour = targetTime.getHours()
  const day = targetTime.getDate()
  const month = targetTime.getMonth() + 1
  
  const cronExpression = `${minute} ${hour} ${day} ${month} *`
  
  return { cron: cronExpression, targetTime }
}

// ─────────────────────────────────────────────────────────────
// JOBS DE PRODUÇÃO
// ─────────────────────────────────────────────────────────────

const PRODUCTION_JOBS = [
  {
    name: "Hotmart - Sync Diário",
    description: "Sincronização completa do Hotmart às 00:00 todos os dias (fuso: Lisboa)",
    syncType: "hotmart",
    cronExpression: "0 0 * * *",
    batchSize: 500,
    notifications: false
  },
  {
    name: "CursEduca - Sync Diário", 
    description: "Sincronização completa do CursEduca às 00:30 todos os dias (fuso: Lisboa)",
    syncType: "curseduca",
    cronExpression: "30 0 * * *",
    batchSize: 100,
    notifications: false
  }
]

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function setupJobs() {
  console.log('🏭 ════════════════════════════════════════════════════')
  console.log('🏭 SETUP COMPLETO - TESTE SEQUENCIAL + PRODUÇÃO')
  console.log('🏭 ════════════════════════════════════════════════════\n')

  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 1: CONECTAR MONGODB
    // ═══════════════════════════════════════════════════════════
    
    console.log('📡 Conectando ao MongoDB...')
    
    if (!MONGO_URI) {
      throw new Error('❌ MONGO_URI não configurado')
    }
    
    await mongoose.connect(MONGO_URI)
    console.log('✅ MongoDB conectado\n')

    const CronJobConfig = mongoose.connection.collection('cronjobconfigs')
    const dummyAdminId = new mongoose.Types.ObjectId('000000000000000000000001')

    // ═══════════════════════════════════════════════════════════
    // STEP 2: LIMPAR JOBS DE TESTE ANTIGOS
    // ═══════════════════════════════════════════════════════════
    
    console.log('🧹 Limpando jobs de teste anteriores...')
    const deleteResult = await CronJobConfig.deleteMany({
      name: { $regex: /^\[TESTE\]/ }
    })
    console.log(`✅ ${deleteResult.deletedCount} jobs de teste removidos\n`)

    let jobsCreated = 0

    // ═══════════════════════════════════════════════════════════
    // STEP 3: CRIAR JOBS DE TESTE SEQUENCIAIS (se ativado)
    // ═══════════════════════════════════════════════════════════
    
    if (CONFIG.enableTestJobs) {
      console.log('🧪 ════════════════════════════════════════════════════')
      console.log('🧪 CRIANDO JOBS DE TESTE SEQUENCIAIS')
      console.log('🧪 Simula execução de produção (Hotmart → CursEduca)')
      console.log('🧪 ════════════════════════════════════════════════════\n')
      
      // ─────────────────────────────────────────────────────────
      // JOB 1: HOTMART (daqui a X minutos)
      // ─────────────────────────────────────────────────────────
      
      const hotmartTiming = getTestCronExpression(CONFIG.testInterval.hotmartStartsIn)
      
      console.log('🔥 JOB 1: HOTMART')
      console.log(`   Hora atual: ${new Date().toLocaleTimeString('pt-PT')}`)
      console.log(`   Inicia em: ${CONFIG.testInterval.hotmartStartsIn} minutos`)
      console.log(`   Hora de execução: ${hotmartTiming.targetTime.toLocaleTimeString('pt-PT')}`)
      console.log(`   Cron: ${hotmartTiming.cron}`)
      console.log(`   Duração estimada: ~9 minutos (4200+ users)`)
      console.log('')
      
      const hotmartJobData = {
        name: `[TESTE] Hotmart - ${new Date().toLocaleTimeString('pt-PT')}`,
        description: `Teste de sync Hotmart (igual à produção) - ${hotmartTiming.targetTime.toLocaleTimeString('pt-PT')}`,
        syncType: "hotmart",
        
        schedule: {
          cronExpression: hotmartTiming.cron,
          timezone: 'Europe/Lisbon',
          enabled: true
        },
        
        syncConfig: {
          fullSync: true,
          includeProgress: true,
          includeTags: false,
          batchSize: 500  // Igual à produção
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
        
        nextRun: hotmartTiming.targetTime,
        createdBy: dummyAdminId,
        isActive: true,
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      const hotmartResult = await CronJobConfig.insertOne(hotmartJobData)
      jobsCreated++
      
      console.log(`✅ Job HOTMART criado! ID: ${hotmartResult.insertedId}`)
      console.log('')
      
      // ─────────────────────────────────────────────────────────
      // JOB 2: CURSEDUCA (X minutos depois do Hotmart)
      // ─────────────────────────────────────────────────────────
      
      const totalMinutes = CONFIG.testInterval.hotmartStartsIn + CONFIG.testInterval.curseducaAfterHotmart
      const curseducaTiming = getTestCronExpression(totalMinutes)
      
      console.log('📚 JOB 2: CURSEDUCA')
      console.log(`   Inicia em: ${totalMinutes} minutos (${CONFIG.testInterval.curseducaAfterHotmart} min após Hotmart)`)
      console.log(`   Hora de execução: ${curseducaTiming.targetTime.toLocaleTimeString('pt-PT')}`)
      console.log(`   Cron: ${curseducaTiming.cron}`)
      console.log(`   Duração estimada: ~3 segundos (20 users)`)
      console.log('')
      
      const curseducaJobData = {
        name: `[TESTE] CursEduca - ${new Date().toLocaleTimeString('pt-PT')}`,
        description: `Teste de sync CursEduca (após Hotmart) - ${curseducaTiming.targetTime.toLocaleTimeString('pt-PT')}`,
        syncType: "curseduca",
        
        schedule: {
          cronExpression: curseducaTiming.cron,
          timezone: 'Europe/Lisbon',
          enabled: true
        },
        
        syncConfig: {
          fullSync: true,
          includeProgress: true,
          includeTags: false,
          batchSize: 100  // Igual à produção
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
        
        nextRun: curseducaTiming.targetTime,
        createdBy: dummyAdminId,
        isActive: true,
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      const curseducaResult = await CronJobConfig.insertOne(curseducaJobData)
      jobsCreated++
      
      console.log(`✅ Job CURSEDUCA criado! ID: ${curseducaResult.insertedId}`)
      console.log('')
      
      console.log('📅 TIMELINE DO TESTE:')
      console.log(`   ${hotmartTiming.targetTime.toLocaleTimeString('pt-PT')} → 🔥 Hotmart inicia (~9 min)`)
      console.log(`   ${curseducaTiming.targetTime.toLocaleTimeString('pt-PT')} → 📚 CursEduca inicia (~3 seg)`)
      console.log('')
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 4: CRIAR JOBS DE PRODUÇÃO (se ativado)
    // ═══════════════════════════════════════════════════════════
    
    if (CONFIG.enableProductionJobs) {
      console.log('🏭 ════════════════════════════════════════════════════')
      console.log('🏭 CRIANDO JOBS DE PRODUÇÃO')
      console.log('🏭 ════════════════════════════════════════════════════\n')
      
      for (const jobConfig of PRODUCTION_JOBS) {
        const existing = await CronJobConfig.findOne({ name: jobConfig.name })
        
        if (existing) {
          console.log(`⚠️ Job JÁ EXISTE: "${jobConfig.name}"`)
          console.log(`   Tipo: ${existing.syncType}`)
          console.log(`   Cron: ${existing.schedule.cronExpression}`)
          console.log(`   Ativo: ${existing.isActive ? '✅' : '❌'}`)
          
          if (existing.lastRun) {
            console.log(`   Última execução: ${new Date(existing.lastRun.startedAt).toLocaleString('pt-PT')}`)
            console.log(`      Status: ${existing.lastRun.status}`)
            console.log(`      Total: ${existing.lastRun.stats?.total || 0}`)
            console.log(`      Atualizados: ${existing.lastRun.stats?.updated || 0}`)
          } else {
            console.log(`   Última execução: Nunca`)
          }
          
          console.log('')
          continue
        }
        
        // Calcular próxima execução
        const now = new Date()
        const nextRun = new Date()
        
        if (jobConfig.cronExpression === "0 0 * * *") {
          nextRun.setHours(0, 0, 0, 0)
          if (nextRun <= now) {
            nextRun.setDate(nextRun.getDate() + 1)
          }
        } else if (jobConfig.cronExpression === "30 0 * * *") {
          nextRun.setHours(0, 30, 0, 0)
          if (nextRun <= now) {
            nextRun.setDate(nextRun.getDate() + 1)
          }
        }
        
        const jobData = {
          name: jobConfig.name,
          description: jobConfig.description,
          syncType: jobConfig.syncType,
          
          schedule: {
            cronExpression: jobConfig.cronExpression,
            timezone: 'Europe/Lisbon',
            enabled: true
          },
          
          syncConfig: {
            fullSync: true,
            includeProgress: true,
            includeTags: false,
            batchSize: jobConfig.batchSize
          },
          
          notifications: {
            enabled: jobConfig.notifications,
            emailOnSuccess: false,
            emailOnFailure: true,
            recipients: []
          },
          
          retryPolicy: {
            maxRetries: 3,
            retryDelayMinutes: 30,
            exponentialBackoff: true
          },
          
          nextRun: nextRun,
          createdBy: dummyAdminId,
          isActive: true,
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
        
        const insertResult = await CronJobConfig.insertOne(jobData)
        jobsCreated++
        
        console.log(`✅ Job de PRODUÇÃO criado!`)
        console.log(`   ID: ${insertResult.insertedId}`)
        console.log(`   Nome: ${jobData.name}`)
        console.log(`   Tipo: ${jobData.syncType}`)
        console.log(`   Cron: ${jobData.schedule.cronExpression}`)
        console.log(`   Próxima execução: ${nextRun.toLocaleString('pt-PT')}`)
        console.log('')
      }
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 5: RESUMO FINAL
    // ═══════════════════════════════════════════════════════════
    
    const allJobs = await CronJobConfig.find({ isActive: true }).toArray()
    
    console.log('📊 ════════════════════════════════════════════════════')
    console.log('📊 RESUMO COMPLETO - TODOS OS JOBS ATIVOS')
    console.log('📊 ════════════════════════════════════════════════════\n')
    
    console.log(`Total de jobs ativos: ${allJobs.length}`)
    console.log(`Jobs criados agora: ${jobsCreated}\n`)
    
    // Separar teste e produção
    const testJobs = allJobs.filter((j: any) => j.name.startsWith('[TESTE]'))
    const prodJobs = allJobs.filter((j: any) => !j.name.startsWith('[TESTE]'))
    
    if (testJobs.length > 0) {
      console.log('🧪 JOBS DE TESTE (SEQUENCIAIS):')
      console.log('   Simulam a execução diária de produção\n')
      
      testJobs
        .sort((a: any, b: any) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime())
        .forEach((job: any, index: number) => {
          console.log(`   ${index + 1}️⃣ ${job.syncType.toUpperCase()}`)
          console.log(`      Nome: ${job.name}`)
          console.log(`      Executa: ${new Date(job.nextRun).toLocaleTimeString('pt-PT')}`)
          console.log(`      Duração: ${job.syncType === 'hotmart' ? '~9 minutos' : '~3 segundos'}`)
          console.log('')
        })
    }
    
    if (prodJobs.length > 0) {
      console.log('🏭 JOBS DE PRODUÇÃO (DIÁRIOS):')
      console.log('   Executam automaticamente todos os dias\n')
      
      prodJobs
        .sort((a: any, b: any) => {
          const [minA, hourA] = a.schedule.cronExpression.split(' ').map(Number)
          const [minB, hourB] = b.schedule.cronExpression.split(' ').map(Number)
          return (hourA * 60 + minA) - (hourB * 60 + minB)
        })
        .forEach((job: any, index: number) => {
          console.log(`   ${index + 1}️⃣ ${job.syncType.toUpperCase()}`)
          console.log(`      Nome: ${job.name}`)
          console.log(`      Horário: ${job.schedule.cronExpression}`)
          console.log(`      Próxima: ${new Date(job.nextRun).toLocaleString('pt-PT')}`)
          console.log('')
        })
    }
    
    console.log('⚠️ ════════════════════════════════════════════════════')
    console.log('⚠️ AÇÃO OBRIGATÓRIA: REINICIAR SERVIDOR!')
    console.log('⚠️ ════════════════════════════════════════════════════\n')
    
    console.log('🔄 PASSOS PARA ATIVAR OS JOBS:')
    console.log('')
    console.log('1️⃣ PARAR o servidor atual')
    console.log('   → No terminal do servidor: Ctrl+C')
    console.log('')
    console.log('2️⃣ INICIAR o servidor novamente')
    console.log('   → npm run dev')
    console.log('')
    console.log('3️⃣ CONFIRMAR no arranque:')
    console.log(`   → "📋 ${allJobs.length} jobs ativos encontrados"`)
    
    allJobs
      .sort((a: any, b: any) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime())
      .forEach((job: any) => {
        console.log(`   → "✅ Job agendado: ${job.name}"`)
      })
    
    console.log('')
    
    if (testJobs.length > 0) {
      console.log('4️⃣ MONITORIZAR TESTE EM TEMPO REAL:')
      console.log('   📺 DEIXAR TERMINAL DO SERVIDOR VISÍVEL!')
      console.log('')
      
      const firstTest = testJobs.sort((a: any, b: any) => 
        new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime()
      )[0]
      
      console.log(`   ${new Date(firstTest.nextRun).toLocaleTimeString('pt-PT')} → 🔥 HOTMART inicia`)
      console.log('      ⏱️ ~9 minutos de processamento')
      console.log('      📊 ~4200 users sincronizados')
      console.log('      💾 BD atualizada em tempo real')
      console.log('')
      
      if (testJobs.length > 1) {
        const secondTest = testJobs.sort((a: any, b: any) => 
          new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime()
        )[1]
        
        console.log(`   ${new Date(secondTest.nextRun).toLocaleTimeString('pt-PT')} → 📚 CURSEDUCA inicia (após Hotmart)`)
        console.log('      ⏱️ ~3 segundos de processamento')
        console.log('      📊 ~20 users sincronizados')
        console.log('      ✅ Teste completo!')
        console.log('')
      }
    }
    
    if (prodJobs.length > 0) {
      console.log('5️⃣ JOBS DE PRODUÇÃO (automático):')
      console.log('   🌙 00:00 → Hotmart sync')
      console.log('   🌙 00:30 → CursEduca sync')
      console.log('   🔁 Todos os dias, automaticamente')
      console.log('')
    }
    
    console.log('✅ Sistema configurado e pronto!')
    console.log('════════════════════════════════════════════════════\n')
    
    // Desconectar
    await mongoose.disconnect()
    console.log('✅ MongoDB desconectado\n')
    
    process.exit(0)

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// ─────────────────────────────────────────────────────────────
// EXECUTAR
// ─────────────────────────────────────────────────────────────

setupJobs()