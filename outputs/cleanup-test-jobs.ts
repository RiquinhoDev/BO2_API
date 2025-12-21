// ════════════════════════════════════════════════════════════
// 📁 scripts/cleanup-test-jobs.ts
// Limpar jobs de teste do CRON
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import * as dotenv from 'dotenv'

dotenv.config()

const API_URL = process.env.VITE_APP_API_URL || 'http://localhost:3001'

async function cleanupTestJobs() {
  console.log('🧹 Limpando jobs de teste...\n')
  
  try {
    const response = await axios.get(`${API_URL}/api/cron/jobs`)
    const jobs = response.data.jobs || []
    
    const testJobs = jobs.filter((j: any) => 
      j.name.startsWith('[TESTE SPRINT 1]') || j.name.startsWith('[TESTE]')
    )
    
    if (testJobs.length === 0) {
      console.log('✅ Nenhum job de teste encontrado!\n')
      return
    }
    
    console.log(`📋 Encontrados ${testJobs.length} jobs de teste:\n`)
    
    for (const job of testJobs) {
      console.log(`   🗑️  Removendo: ${job.name}`)
      console.log(`      ID: ${job._id}`)
      console.log(`      Tipo: ${job.syncType}`)
      console.log(`      Execuções: ${job.totalRuns}`)
      
      await axios.delete(`${API_URL}/api/cron/jobs/${job._id}`)
      
      console.log(`      ✅ Removido!\n`)
    }
    
    console.log(`✅ ${testJobs.length} jobs de teste removidos com sucesso!\n`)
    
  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    if (error.response) {
      console.error('   Status:', error.response.status)
      console.error('   Dados:', error.response.data)
    }
    process.exit(1)
  }
}

cleanupTestJobs()