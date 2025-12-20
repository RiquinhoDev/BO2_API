// ════════════════════════════════════════════════════════════
// 🧪 SCRIPT DE TESTE SIMPLIFICADO - CRON AUTOMÁTICO
// Criar job via MongoDB direto (sem dependência de Admin)
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

// ─────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DO TESTE
// ─────────────────────────────────────────────────────────────

const TEST_CONFIG = {
  // Escolher plataforma: 'hotmart' | 'curseduca' | 'all'
  syncType: 'curseduca' as const, // CursEduca é mais rápido (19 users vs 4200)
  
  // Minutos até executar (2-3 minutos)
  minutesFromNow: 2,
  
  // Nome do job
  jobName: `[TESTE] Sync Automático ${new Date().toLocaleTimeString('pt-PT')}`
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
  
  // CRON: minuto hora dia mês dia_da_semana
  const cronExpression = `${minute} ${hour} ${day} ${month} *`
  
  return { cron: cronExpression, targetTime }
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function testCronScheduler() {
  console.log('🧪 ════════════════════════════════════════════════════')
  console.log('🧪 TESTE DO SISTEMA DE AUTOMAÇÃO CRON (SIMPLIFICADO)')
  console.log('🧪 ════════════════════════════════════════════════════\n')

  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 1: CONECTAR MONGODB
    // ═══════════════════════════════════════════════════════════
    
console.log('🧪 ════════════════════════════════════════════════════')
  console.log('🧪 TESTE DO SISTEMA DE AUTOMAÇÃO CRON')
  console.log('🧪 ════════════════════════════════════════════════════\n')
 const MONGO_URI="mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"

    // ═══════════════════════════════════════════════════════════
    // STEP 1: CONECTAR MONGODB
    // ═══════════════════════════════════════════════════════════
    
    console.log('📡 Conectando ao MongoDB...')
    
    if (!MONGO_URI) {
      throw new Error('❌ MONGO_URI não configurado no .env')
    }
    
    await mongoose.connect(MONGO_URI)
    console.log('✅ MongoDB conectado\n')


    // ═══════════════════════════════════════════════════════════
    // STEP 2: CALCULAR HORA DE EXECUÇÃO
    // ═══════════════════════════════════════════════════════════
    
    const { cron, targetTime } = getTestCronExpression(TEST_CONFIG.minutesFromNow)
    
    console.log('⏰ AGENDAMENTO:')
    console.log(`   Plataforma: ${TEST_CONFIG.syncType.toUpperCase()}`)
    console.log(`   Hora atual: ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`)
    console.log(`   Hora de execução: ${targetTime.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`)
    console.log(`   Cron expression: ${cron}`)
    console.log(`   Timezone: Europe/Lisbon\n`)

    // ═══════════════════════════════════════════════════════════
    // STEP 3: LIMPAR JOBS ANTERIORES DE TESTE
    // ═══════════════════════════════════════════════════════════
    
    console.log('🧹 Limpando jobs de teste anteriores...')
    
    const CronJobConfig = mongoose.connection.collection('cronjobconfigs')
    const deleteResult = await CronJobConfig.deleteMany({
      name: { $regex: /^\[TESTE\]/ }
    })
    
    console.log(`✅ ${deleteResult.deletedCount} jobs de teste removidos\n`)

    // ═══════════════════════════════════════════════════════════
    // STEP 4: CRIAR JOB DE TESTE (DIRETO NA BD)
    // ═══════════════════════════════════════════════════════════
    
    console.log('📝 Criando job de teste...')
    
    const dummyAdminId = new mongoose.Types.ObjectId('000000000000000000000001')
    
    const jobData = {
      name: TEST_CONFIG.jobName,
      description: `Job de teste automático - Executa ${TEST_CONFIG.syncType} às ${targetTime.toLocaleTimeString('pt-PT')}`,
      syncType: TEST_CONFIG.syncType,
      
      schedule: {
        cronExpression: cron,
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
        retryDelayMinutes: 5,  // Mínimo permitido pelo schema
        exponentialBackoff: false
      },
      
      nextRun: targetTime,
      createdBy: dummyAdminId,
      isActive: true,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    const insertResult = await CronJobConfig.insertOne(jobData)
    const jobId = insertResult.insertedId
    
    console.log(`✅ Job criado com sucesso!`)
    console.log(`   ID: ${jobId}`)
    console.log(`   Nome: ${jobData.name}`)
    console.log(`   Tipo: ${jobData.syncType}`)
    console.log(`   Próxima execução: ${targetTime.toLocaleString('pt-PT')}\n`)

    // ═══════════════════════════════════════════════════════════
    // STEP 5: INSTRUÇÕES PARA REINICIAR SERVIDOR
    // ═══════════════════════════════════════════════════════════
    
    console.log('🚀 ════════════════════════════════════════════════════')
    console.log('🚀 PRÓXIMO PASSO: REINICIAR SERVIDOR')
    console.log('🚀 ════════════════════════════════════════════════════\n')
    
    console.log('⚠️ IMPORTANTE: Para o scheduler carregar o job, você precisa:')
    console.log('')
    console.log('   1️⃣ PARAR o servidor atual (se estiver rodando)')
    console.log('      → Ctrl+C no terminal do servidor')
    console.log('')
    console.log('   2️⃣ INICIAR o servidor novamente')
    console.log('      → npm run dev')
    console.log('')
    console.log('   3️⃣ VERIFICAR os logs do servidor')
    console.log('      → Deve mostrar: "✅ Job agendado: [TESTE] Sync Automático..."')
    console.log('')
    console.log(`   4️⃣ AGUARDAR execução às ${targetTime.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`)
    console.log('      → O servidor vai executar automaticamente!')
    console.log('')
    
    console.log('📊 LOGS ESPERADOS NO SERVIDOR:')
    console.log('   ✅ Scheduler inicializado')
    console.log('   ✅ 1 jobs ativos encontrados')
    console.log(`   ✅ Job agendado: ${jobData.name}`)
    console.log('   ...')
    console.log(`   ⏰ Executando job agendado: ${jobData.name}`)
    console.log('   🚀 [${syncType}Universal] Iniciando sync...')
    console.log('   📊 [${syncType}Universal] 100% (X/X)')
    console.log('   ✅ Sync concluída!')
    console.log('')
    
    console.log('🔍 VERIFICAR RESULTADOS:')
    console.log('   1. Nos logs do servidor (acima)')
    console.log('   2. MongoDB Compass:')
    console.log('      → Collection: cronjobconfigs')
    console.log(`      → Documento ID: ${jobId}`)
    console.log('      → Ver campo: lastRun.stats')
    console.log('')
    
    console.log('🧹 LIMPAR JOB DEPOIS:')
    console.log('   → Executar este script novamente (remove jobs [TESTE])')
    console.log('   → OU deletar manualmente no MongoDB Compass')
    console.log('')
    
    console.log('✅ Job de teste criado e pronto para execução!')
    console.log('════════════════════════════════════════════════════\n')
    
    // Desconectar
    await mongoose.disconnect()
    console.log('✅ MongoDB desconectado\n')
    
    process.exit(0)

  } catch (error: any) {
    console.error('\n❌ ERRO NO TESTE:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// ─────────────────────────────────────────────────────────────
// EXECUTAR
// ─────────────────────────────────────────────────────────────

testCronScheduler()