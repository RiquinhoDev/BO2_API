// ════════════════════════════════════════════════════════════
// 🧪 TESTE: ResetCounters (após migração)
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'

async function testResetCounters() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('🧪 TESTE: ResetCounters (pós-migração)')
  console.log('═'.repeat(70))
  console.log()
  
  try {
    console.log(`📡 API: ${API_URL}`)
    console.log()
    
    // 1. Buscar job
    console.log('🔍 Buscando job ResetCounters...')
    const jobsResponse = await axios.get(`${API_URL}/api/cron/jobs`)
    
    const jobs = jobsResponse.data.data.jobs
    const resetJob = jobs.find((j: any) => j.name === 'ResetCounters')
    
    if (!resetJob) {
      console.log('❌ Job ResetCounters não encontrado!')
      return
    }
    
    console.log(`✅ Job encontrado: ${resetJob._id}`)
    console.log()
    
    // 2. Executar
    console.log('═'.repeat(70))
    console.log('🔄 EXECUTANDO JOB...')
    console.log('═'.repeat(70))
    console.log()
    
    const startTime = Date.now()
    
    const response = await axios.post(
      `${API_URL}/api/cron/jobs/${resetJob._id}/trigger`,
      {},
      {
        validateStatus: () => true,
        timeout: 300000  // 5 minutos
      }
    )
    
    const duration = Math.round((Date.now() - startTime) / 1000)
    
    console.log()
    console.log('═'.repeat(70))
    console.log('📊 RESULTADO')
    console.log('═'.repeat(70))
    console.log()
    console.log(`⏱️  Duração: ${duration}s`)
    console.log()
    
    if (!response.data.success) {
      console.log('❌ JOB FALHOU!')
      console.log()
      console.log('📋 Erro:')
      console.log(JSON.stringify(response.data, null, 2))
      console.log()
      
      console.log('═'.repeat(70))
      console.log('🔍 O QUE FAZER:')
      console.log('═'.repeat(70))
      console.log()
      console.log('1. Verifica logs do servidor (terminal npm run dev)')
      console.log('2. Procura erros de validação (engagementLevel)')
      console.log('3. Se ainda houver erros de validação:')
      console.log('   → A migração pode não ter funcionado')
      console.log('   → Executar novamente: npx ts-node scripts/verify-migration.ts')
      console.log()
      
    } else {
      console.log('✅ JOB EXECUTADO COM SUCESSO!')
      console.log()
      
      if (response.data.data) {
        const data = response.data.data
        
        console.log('📊 ESTATÍSTICAS:')
        console.log(`   Users atualizados: ${data.usersUpdated || data.weeklyCountersReset || 0}`)
        console.log(`   Contadores semanais: ${data.weeklyCountersReset || 0}`)
        console.log(`   Contadores mensais: ${data.monthlyCountersReset || 0}`)
        console.log(`   Ações deletadas: ${data.actionsDeleted || 0}`)
        console.log(`   Erros: ${data.errors || 0}`)
        console.log()
      }
      
      console.log('═'.repeat(70))
      console.log('🎉 SUCESSO!')
      console.log('═'.repeat(70))
      console.log()
      console.log('✅ ResetCounters funciona perfeitamente!')
      console.log('✅ Migração de nomenclatura bem-sucedida!')
      console.log('✅ Validação do Mongoose OK!')
      console.log()
      console.log('📋 PRÓXIMO PASSO:')
      console.log('   Testar outros jobs: npx ts-node scripts/test-e2e-all-jobs.ts')
      console.log()
    }
    
  } catch (error: any) {
    console.error()
    console.error('═'.repeat(70))
    console.error('❌ ERRO')
    console.error('═'.repeat(70))
    console.error()
    console.error(`Erro: ${error.message}`)
    console.error()
    
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 SOLUÇÃO:')
      console.error('   O servidor não está a correr!')
      console.error('   Executar: npm run dev')
      console.error()
    }
    
    process.exit(1)
  }
}

testResetCounters()