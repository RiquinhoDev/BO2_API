// ════════════════════════════════════════════════════════════
// 📁 scripts/debug-job-errors.ts
// Script: Debug COMPLETO dos erros de criação
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'

// ═══════════════════════════════════════════════════════════
// JOB DE TESTE (vamos testar EvaluateRules)
// ═══════════════════════════════════════════════════════════

const TEST_JOB = {
  name: 'EvaluateRules_TEST',  // Nome diferente para não conflitar
  description: 'Teste debug',
  syncType: 'all',
  cronExpression: '0 2 * * *',
  timezone: 'Europe/Lisbon',
  syncConfig: {
    fullSync: false,
    includeProgress: false,
    includeTags: true,
    batchSize: 500
  },
  tagRuleOptions: {
    enabled: true,
    executeAllRules: true,
    runInParallel: false,
    stopOnError: false
  },
  notifications: {
    enabled: false,
    emailOnSuccess: false,
    emailOnFailure: true,
    recipients: ['admin@osriquinhos.com']
  },
  retryPolicy: {
    maxRetries: 2,
    retryDelayMinutes: 5,
    exponentialBackoff: false
  },
  createdBy: '000000000000000000000001'
}

// ═══════════════════════════════════════════════════════════
// DEBUG
// ═══════════════════════════════════════════════════════════

async function debugJobCreation() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('🔍 DEBUG COMPLETO - CRIAÇÃO DE JOB')
  console.log('═'.repeat(70))
  console.log()
  
  // API URL
  console.log(`🌐 API URL: ${API_URL}`)
  console.log(`📡 Endpoint: POST ${API_URL}/api/cron/jobs`)
  console.log()
  
  // Payload
  console.log('═'.repeat(70))
  console.log('📤 PAYLOAD ENVIADO:')
  console.log('═'.repeat(70))
  console.log(JSON.stringify(TEST_JOB, null, 2))
  console.log()
  
  // Fazer request
  console.log('═'.repeat(70))
  console.log('🔄 ENVIANDO REQUEST...')
  console.log('═'.repeat(70))
  console.log()
  
  try {
    const response = await axios.post(
      `${API_URL}/api/cron/jobs`,
      TEST_JOB,
      {
        validateStatus: () => true,  // Não lançar erro em nenhum status
        timeout: 10000
      }
    )
    
    // Response básico
    console.log('📥 RESPONSE RECEBIDO:')
    console.log(`   Status: ${response.status}`)
    console.log(`   Status Text: ${response.statusText}`)
    console.log()
    
    // Headers
    console.log('📋 HEADERS:')
    console.log(JSON.stringify(response.headers, null, 2))
    console.log()
    
    // Body completo
    console.log('═'.repeat(70))
    console.log('📦 RESPONSE BODY COMPLETO:')
    console.log('═'.repeat(70))
    console.log(JSON.stringify(response.data, null, 2))
    console.log()
    
    // Análise
    console.log('═'.repeat(70))
    console.log('🔍 ANÁLISE:')
    console.log('═'.repeat(70))
    
    if (response.data.success) {
      console.log('✅ JOB CRIADO COM SUCESSO!')
      console.log(`   ID: ${response.data.data?.job?._id}`)
    } else {
      console.log('❌ ERRO AO CRIAR JOB!')
      console.log()
      console.log('📋 Detalhes do Erro:')
      
      if (response.data.error) {
        console.log(`   Error: ${response.data.error}`)
      }
      
      if (response.data.message) {
        console.log(`   Message: ${response.data.message}`)
      }
      
      if (response.data.details) {
        console.log('   Details:')
        console.log(JSON.stringify(response.data.details, null, 4))
      }
      
      // Mongoose validation errors
      if (response.data.errors) {
        console.log('   Validation Errors:')
        console.log(JSON.stringify(response.data.errors, null, 4))
      }
    }
    
  } catch (error: any) {
    console.log('❌ ERRO DE REDE/CONEXÃO!')
    console.log()
    
    if (error.response) {
      console.log('📋 Error Response:')
      console.log(`   Status: ${error.response.status}`)
      console.log(`   Data:`)
      console.log(JSON.stringify(error.response.data, null, 2))
    } else if (error.request) {
      console.log('📋 Request foi feito mas sem resposta:')
      console.log(error.request)
    } else {
      console.log('📋 Erro ao configurar request:')
      console.log(error.message)
    }
    
    console.log()
    console.log('📋 Stack Trace:')
    console.log(error.stack)
  }
  
  console.log()
  console.log('═'.repeat(70))
  console.log('✅ DEBUG COMPLETO!')
  console.log('═'.repeat(70))
  console.log()
}

// ═══════════════════════════════════════════════════════════
// EXECUTAR
// ═══════════════════════════════════════════════════════════

debugJobCreation().catch(error => {
  console.error('❌ ERRO FATAL:', error)
  process.exit(1)
})