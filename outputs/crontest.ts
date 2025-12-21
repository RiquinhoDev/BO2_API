// ════════════════════════════════════════════════════════════
// 🧪 CRON JOBS TESTE - Executa em 3 minutos
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import CronJobConfig from '../src/models/SyncModels/CronJobConfig'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

async function setupTestCronJobs() {
  await mongoose.connect(MONGODB_URI)
  
  console.log('\n🧪 ════════════════════════════════════════════════════════════')
  console.log('🧪 CRON JOBS TESTE - Executa em 3 MINUTOS')
  console.log('🧪 ════════════════════════════════════════════════════════════\n')
  
  const adminId = new mongoose.Types.ObjectId('000000000000000000000001')
  
  const now = new Date()
  const in3min = new Date(now.getTime() + 3 * 60 * 1000)
  const in4min = new Date(now.getTime() + 4 * 60 * 1000)
  
  console.log(`⏰ Horário atual: ${now.toLocaleTimeString('pt-PT')}`)
  console.log(`🔥 Hotmart executará: ${in3min.toLocaleTimeString('pt-PT')}`)
  console.log(`📚 CursEDuca executará: ${in4min.toLocaleTimeString('pt-PT')}\n`)
  
  const jobsCreated = []
  
  // ═══════════════════════════════════════════════════════════
  // JOB 1: HOTMART - +3min
  // ═══════════════════════════════════════════════════════════
  
  console.log('🔥 Criando job HOTMART (teste)...')
  await CronJobConfig.deleteOne({ name: 'TEST_HOTMART_3MIN' })
  
  const hotmartJob = await CronJobConfig.create({
    name: 'TEST_HOTMART_3MIN',
    description: 'TESTE - Sync Hotmart em 3 minutos',
    syncType: 'hotmart',
    
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
  
  jobsCreated.push({ 
    name: 'Hotmart', 
    id: hotmartJob._id, 
    time: in3min.toLocaleTimeString('pt-PT') 
  })
  console.log(`   ✅ ${hotmartJob._id}`)
  console.log(`   ⏰ ${in3min.toLocaleTimeString('pt-PT')}\n`)
  
  // ═══════════════════════════════════════════════════════════
  // JOB 2: CURSEDUCA - +4min
  // ═══════════════════════════════════════════════════════════
  
  console.log('📚 Criando job CURSEDUCA (teste)...')
  await CronJobConfig.deleteOne({ name: 'TEST_CURSEDUCA_4MIN' })
  
  const curseducaJob = await CronJobConfig.create({
    name: 'TEST_CURSEDUCA_4MIN',
    description: 'TESTE - Sync CursEDuca em 4 minutos',
    syncType: 'curseduca',
    
    schedule: {
      cronExpression: `${in4min.getMinutes()} ${in4min.getHours()} * * *`,
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
    nextRun: in4min
  })
  
  jobsCreated.push({ 
    name: 'CursEDuca', 
    id: curseducaJob._id, 
    time: in4min.toLocaleTimeString('pt-PT') 
  })
  console.log(`   ✅ ${curseducaJob._id}`)
  console.log(`   ⏰ ${in4min.toLocaleTimeString('pt-PT')}\n`)
  
  // ═══════════════════════════════════════════════════════════
  // RESUMO
  // ═══════════════════════════════════════════════════════════
  
  console.log('═'.repeat(70))
  console.log('✅ JOBS DE TESTE CRIADOS!')
  console.log('═'.repeat(70) + '\n')
  
  jobsCreated.forEach(job => {
    console.log(`   ${job.name.padEnd(15)} | ${job.time} | ${job.id}`)
  })
  
  console.log('\n⏳ AGUARDE 5 MINUTOS...')
  console.log('📊 Depois execute: npx tsx OUTPUTS/validate-sync-data.ts')
  console.log('\n🧹 Para limpar jobs de teste:')
  console.log('   db.cronjobconfigs.deleteMany({ name: /^TEST_/ })\n')
  
  await mongoose.disconnect()
}

setupTestCronJobs()