// ════════════════════════════════════════════════════════════
// ⏰ CRON JOBS PRODUÇÃO - Executa TODAS AS NOITES às 00:00
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import CronJobConfig from '../src/models/SyncModels/CronJobConfig'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

async function setupProductionCronJobs() {
  await mongoose.connect(MONGODB_URI)
  
  console.log('\n🌙 ════════════════════════════════════════════════════════════')
  console.log('🌙 CRON JOBS PRODUÇÃO - Executa às 00:00 TODAS AS NOITES')
  console.log('🌙 ════════════════════════════════════════════════════════════\n')
  
  const adminId = new mongoose.Types.ObjectId('000000000000000000000001')
  
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  midnight.setDate(midnight.getDate() + 1)
  
  console.log(`🌙 Próxima execução: ${midnight.toLocaleString('pt-PT')}\n`)
  
  const jobsCreated = []
  
  // ═══════════════════════════════════════════════════════════
  // JOB 1: HOTMART - 00:00
  // ═══════════════════════════════════════════════════════════
  
  console.log('🔥 Criando job HOTMART...')
  await CronJobConfig.deleteOne({ name: 'PROD_HOTMART_DAILY' })
  
  const hotmartTime = new Date(midnight)
  const hotmartJob = await CronJobConfig.create({
    name: 'PROD_HOTMART_DAILY',
    description: 'Sync automático Hotmart - 00:00 diariamente',
    syncType: 'hotmart',
    
    schedule: {
      cronExpression: '0 0 * * *',
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
      enabled: true,
      emailOnSuccess: false,
      emailOnFailure: true,
      recipients: ['contactos@serriquinho.com']
    },
    
    retryPolicy: {
      maxRetries: 3,
      retryDelayMinutes: 30,
      exponentialBackoff: true
    },
    
    createdBy: adminId,
    isActive: true,
    nextRun: hotmartTime
  })
  
  jobsCreated.push({ name: 'Hotmart', id: hotmartJob._id, time: '00:00' })
  console.log(`   ✅ ${hotmartJob._id}`)
  console.log(`   ⏰ 00:00 todos os dias\n`)
  
  // ═══════════════════════════════════════════════════════════
  // JOB 2: CURSEDUCA - 00:10
  // ═══════════════════════════════════════════════════════════
  
  console.log('📚 Criando job CURSEDUCA...')
  await CronJobConfig.deleteOne({ name: 'PROD_CURSEDUCA_DAILY' })
  
  const curseducaTime = new Date(midnight)
  curseducaTime.setMinutes(10)
  
  const curseducaJob = await CronJobConfig.create({
    name: 'PROD_CURSEDUCA_DAILY',
    description: 'Sync automático CursEDuca - 00:10 diariamente',
    syncType: 'curseduca',
    
    schedule: {
      cronExpression: '10 0 * * *',
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
      enabled: true,
      emailOnSuccess: false,
      emailOnFailure: true,
      recipients: ['contactos@serriquinho.com']
    },
    
    retryPolicy: {
      maxRetries: 3,
      retryDelayMinutes: 30,
      exponentialBackoff: true
    },
    
    createdBy: adminId,
    isActive: true,
    nextRun: curseducaTime
  })
  
  jobsCreated.push({ name: 'CursEDuca', id: curseducaJob._id, time: '00:10' })
  console.log(`   ✅ ${curseducaJob._id}`)
  console.log(`   ⏰ 00:10 todos os dias\n`)
  
  // ═══════════════════════════════════════════════════════════
  // RESUMO
  // ═══════════════════════════════════════════════════════════
  
  console.log('═'.repeat(70))
  console.log('✅ JOBS DE PRODUÇÃO CRIADOS!')
  console.log('═'.repeat(70) + '\n')
  
  jobsCreated.forEach(job => {
    console.log(`   ${job.name.padEnd(15)} | ${job.time} | ${job.id}`)
  })
  
  console.log('\n🌙 Próxima execução: ' + midnight.toLocaleString('pt-PT'))
  console.log('🎉 Sistema configurado para sync automático TODAS AS NOITES!\n')
  
  await mongoose.disconnect()
}

setupProductionCronJobs()