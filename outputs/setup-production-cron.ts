// ════════════════════════════════════════════════════════════
// ⏰ SETUP COMPLETO - CRON JOBS DE PRODUÇÃO
// ════════════════════════════════════════════════════════════
// Cria jobs para sync automático TODAS AS NOITES às 00:00

import mongoose from 'mongoose'
import CronJobConfig from '../src/models/SyncModels/CronJobConfig'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

async function setupProductionCronJobs() {
  await mongoose.connect(MONGODB_URI)
  
  console.log('\n⏰ ════════════════════════════════════════════════════════════')
  console.log('⏰ CONFIGURANDO CRON JOBS DE PRODUÇÃO')
  console.log('⏰ ════════════════════════════════════════════════════════════\n')
  
  // Admin ID (usar um real se existir, senão criar fake)
  const adminId = new mongoose.Types.ObjectId('000000000000000000000001')
  
  // Calcular próxima meia-noite
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  midnight.setDate(midnight.getDate() + 1) // Próxima meia-noite
  
  console.log(`🌙 Próxima execução: ${midnight.toLocaleString('pt-PT')}\n`)
  
  const jobsCreated = []
  
  // ═══════════════════════════════════════════════════════════
  // 1. JOB HOTMART - 00:00
  // ═══════════════════════════════════════════════════════════
  
  console.log('🔥 Criando job HOTMART...')
  
  await CronJobConfig.deleteOne({ name: 'HOTMART_DAILY_SYNC' })
  
  const hotmartTime = new Date(midnight)
  const hotmartJob = await CronJobConfig.create({
    name: 'HOTMART_DAILY_SYNC',
    description: 'Sync diário Hotmart - executa às 00:00 todos os dias',
    syncType: 'hotmart',
    
    schedule: {
      cronExpression: '0 0 * * *', // 00:00 todos os dias
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
  console.log(`   ✅ Job criado: ${hotmartJob._id}`)
  console.log(`   ⏰ Horário: 00:00 (meia-noite)\n`)
  
  // ═══════════════════════════════════════════════════════════
  // 2. JOB CURSEDUCA - 00:10 (10min após Hotmart)
  // ═══════════════════════════════════════════════════════════
  
  console.log('📚 Criando job CURSEDUCA...')
  
  await CronJobConfig.deleteOne({ name: 'CURSEDUCA_DAILY_SYNC' })
  
  const curseducaTime = new Date(midnight)
  curseducaTime.setMinutes(10)
  
  const curseducaJob = await CronJobConfig.create({
    name: 'CURSEDUCA_DAILY_SYNC',
    description: 'Sync diário CursEDuca - executa às 00:10 todos os dias',
    syncType: 'curseduca',
    
    schedule: {
      cronExpression: '10 0 * * *', // 00:10 todos os dias
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
  console.log(`   ✅ Job criado: ${curseducaJob._id}`)
  console.log(`   ⏰ Horário: 00:10\n`)
  
  // ═══════════════════════════════════════════════════════════
  // 3. JOB DISCORD - 00:20 (20min após Hotmart)
  // ═══════════════════════════════════════════════════════════
  
  console.log('💬 Criando job DISCORD...')
  
  await CronJobConfig.deleteOne({ name: 'DISCORD_DAILY_SYNC' })
  
  const discordTime = new Date(midnight)
  discordTime.setMinutes(20)
  
  const discordJob = await CronJobConfig.create({
    name: 'DISCORD_DAILY_SYNC',
    description: 'Sync diário Discord - executa às 00:20 todos os dias',
    syncType: 'discord',
    
    schedule: {
      cronExpression: '20 0 * * *', // 00:20 todos os dias
      timezone: 'Europe/Lisbon',
      enabled: true
    },
    
    syncConfig: {
      fullSync: true,
      includeProgress: false,
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
    nextRun: discordTime
  })
  
  jobsCreated.push({ name: 'Discord', id: discordJob._id, time: '00:20' })
  console.log(`   ✅ Job criado: ${discordJob._id}`)
  console.log(`   ⏰ Horário: 00:20\n`)
  
  // ═══════════════════════════════════════════════════════════
  // 4. JOB DASHBOARD REBUILD - 00:30
  // ═══════════════════════════════════════════════════════════
  
  console.log('📊 Criando job DASHBOARD REBUILD...')
  
  await CronJobConfig.deleteOne({ name: 'DASHBOARD_REBUILD' })
  
  const dashboardTime = new Date(midnight)
  dashboardTime.setMinutes(30)
  
  const dashboardJob = await CronJobConfig.create({
    name: 'DASHBOARD_REBUILD',
    description: 'Rebuild dashboard stats - executa às 00:30 todos os dias',
    syncType: 'manual', // Tipo especial
    
    schedule: {
      cronExpression: '30 0 * * *', // 00:30 todos os dias
      timezone: 'Europe/Lisbon',
      enabled: true
    },
    
    syncConfig: {
      fullSync: false,
      includeProgress: false,
      includeTags: false,
      batchSize: 0
    },
    
    notifications: {
      enabled: false,
      emailOnSuccess: false,
      emailOnFailure: false,
      recipients: []
    },
    
    retryPolicy: {
      maxRetries: 2,
      retryDelayMinutes: 15,
      exponentialBackoff: false
    },
    
    createdBy: adminId,
    isActive: true,
    nextRun: dashboardTime
  })
  
  jobsCreated.push({ name: 'Dashboard Rebuild', id: dashboardJob._id, time: '00:30' })
  console.log(`   ✅ Job criado: ${dashboardJob._id}`)
  console.log(`   ⏰ Horário: 00:30\n`)
  
  // ═══════════════════════════════════════════════════════════
  // RESUMO FINAL
  // ═══════════════════════════════════════════════════════════
  
  console.log('═'.repeat(70))
  console.log('✅ CRON JOBS DE PRODUÇÃO CONFIGURADOS!')
  console.log('═'.repeat(70) + '\n')
  
  console.log('📋 JOBS CRIADOS:\n')
  jobsCreated.forEach(job => {
    console.log(`   ${job.name.padEnd(20)} | ${job.time} | ${job.id}`)
  })
  
  console.log('\n⏰ HORÁRIOS:')
  console.log('   🔥 00:00 - Hotmart Sync')
  console.log('   📚 00:10 - CursEDuca Sync')
  console.log('   💬 00:20 - Discord Sync')
  console.log('   📊 00:30 - Dashboard Rebuild\n')
  
  console.log('🌙 PRÓXIMA EXECUÇÃO:')
  console.log(`   ${midnight.toLocaleString('pt-PT')}\n`)
  
  console.log('═'.repeat(70))
  console.log('💡 GESTÃO DOS JOBS:')
  console.log('═'.repeat(70))
  console.log('   Ver jobs ativos:')
  console.log('   > db.cronjobconfigs.find({ isActive: true })\n')
  console.log('   Ver histórico:')
  console.log('   > db.synchistories.find().sort({ startedAt: -1 }).limit(10)\n')
  console.log('   Desativar todos os jobs:')
  console.log('   > db.cronjobconfigs.updateMany({}, { $set: { "schedule.enabled": false } })\n')
  console.log('   Reativar todos os jobs:')
  console.log('   > db.cronjobconfigs.updateMany({}, { $set: { "schedule.enabled": true } })\n')
  console.log('═'.repeat(70) + '\n')
  
  console.log('🎉 SISTEMA PRONTO PARA PRODUÇÃO!')
  console.log('🎉 Sync automático configurado para TODAS AS NOITES às 00:00\n')
  
  await mongoose.disconnect()
}

setupProductionCronJobs()