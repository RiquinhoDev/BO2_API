// ════════════════════════════════════════════════════════════
// 📁 scripts/debug-api-execute.ts
// DEBUG: Ver exatamente o que a API retorna
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'

async function debugExecuteEndpoint() {
  console.log('🔍 ════════════════════════════════════════════════════════════')
  console.log('🔍 DEBUG: Testar endpoint de execução')
  console.log('🔍 ════════════════════════════════════════════════════════════\n')
  
  try {
    // 1. Buscar jobs
    console.log('📋 PASSO 1: Buscar lista de jobs...\n')
    const jobsResponse = await axios.get(`${API_URL}/api/cron/jobs`)
    
    console.log('Response Status:', jobsResponse.status)
    console.log('Response Data:', JSON.stringify(jobsResponse.data, null, 2))
    console.log()
    
    if (!jobsResponse.data.success || !jobsResponse.data.data?.jobs?.length) {
      console.log('❌ Nenhum job encontrado!')
      return
    }
    
    const jobs = jobsResponse.data.data.jobs
    console.log(`✅ ${jobs.length} jobs encontrados\n`)
    
    // 2. Pegar primeiro job para testar
    const testJob = jobs.find((j: any) => 
      j.name === 'RebuildDashboardStats' || 
      j.name === 'ResetCounters'
    ) || jobs[0]
    
    console.log('📋 PASSO 2: Testar execução do job...\n')
    console.log(`Job selecionado: ${testJob.name}`)
    console.log(`Job ID: ${testJob._id}\n`)
    
    // 3. Tentar executar (com TODOS os detalhes)
    console.log('🔄 Executando POST request...')
    console.log(`URL: ${API_URL}/api/cron/jobs/${testJob._id}/execute`)
    console.log()
    
    try {
      const executeResponse = await axios.post(
        `${API_URL}/api/cron/jobs/${testJob._id}/execute`,
        {},
        { 
          validateStatus: () => true,  // Aceitar qualquer status
          timeout: 60000  // 60 segundos
        }
      )
      
      console.log('📦 RESPOSTA DA API:')
      console.log('─'.repeat(70))
      console.log('Status Code:', executeResponse.status)
      console.log('Status Text:', executeResponse.statusText)
      console.log()
      console.log('Headers:', JSON.stringify(executeResponse.headers, null, 2))
      console.log()
      console.log('Data:', JSON.stringify(executeResponse.data, null, 2))
      console.log('─'.repeat(70))
      console.log()
      
      // Analisar resposta
      if (executeResponse.status === 404) {
        console.log('❌ ERRO: Endpoint não encontrado!')
        console.log('   O endpoint /api/cron/jobs/:id/execute não existe!')
        console.log()
        console.log('💡 VERIFICAR:')
        console.log('   1. Routes estão registadas?')
        console.log('   2. Controller tem método executeJob?')
        console.log('   3. URL está correta?')
        
      } else if (executeResponse.status === 500) {
        console.log('❌ ERRO: Servidor crashou!')
        console.log('   Ver logs do servidor para detalhes')
        
      } else if (executeResponse.data.success === false) {
        console.log('⚠️  Job executou mas retornou erro:')
        console.log(`   Mensagem: ${executeResponse.data.message}`)
        console.log(`   Erro: ${executeResponse.data.error}`)
        
      } else if (executeResponse.data.success === true) {
        console.log('✅ Job executou com sucesso!')
        console.log(`   Dados: ${JSON.stringify(executeResponse.data.data, null, 2)}`)
        
      } else {
        console.log('❓ Resposta inesperada!')
        console.log('   Não tem campo "success"')
      }
      
    } catch (executeError: any) {
      console.log('❌ ERRO AO EXECUTAR REQUEST:')
      console.log('─'.repeat(70))
      console.log('Mensagem:', executeError.message)
      console.log('Code:', executeError.code)
      
      if (executeError.response) {
        console.log('Response Status:', executeError.response.status)
        console.log('Response Data:', JSON.stringify(executeError.response.data, null, 2))
      } else {
        console.log('Sem response (timeout ou network error)')
      }
      console.log('─'.repeat(70))
    }
    
  } catch (error: any) {
    console.log('❌ ERRO GERAL:')
    console.log(error.message)
    console.log(error.stack)
  }
}

debugExecuteEndpoint()