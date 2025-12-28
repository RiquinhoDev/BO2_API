// ════════════════════════════════════════════════════════════
// 🧪 TESTE RÁPIDO: Só EvaluateRules
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'

async function testEvaluateRules() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('🧪 TESTE RÁPIDO: EvaluateRules')
  console.log('═'.repeat(70))
  console.log()
  console.log(`📡 API: ${API_URL}`)
  console.log(`📅 Início: ${new Date().toLocaleString('pt-PT')}`)
  console.log()
  
  try {
    // 1. Buscar job
    console.log('🔍 Buscando job EvaluateRules...')
    const jobsResponse = await axios.get(`${API_URL}/api/cron/jobs`)
    
    if (!jobsResponse.data.success) {
      throw new Error('Erro ao buscar jobs')
    }
    
    const jobs = jobsResponse.data.data.jobs
    const evaluateRulesJob = jobs.find((j: any) => j.name === 'EvaluateRules')
    
    if (!evaluateRulesJob) {
      throw new Error('Job EvaluateRules não encontrado!')
    }
    
    console.log(`✅ Job encontrado: ${evaluateRulesJob._id}`)
    console.log()
    
    // 2. Executar
    console.log('═'.repeat(70))
    console.log('🔄 EXECUTANDO JOB...')
    console.log('═'.repeat(70))
    console.log()
    console.log('⏳ Aguardando conclusão...')
    console.log('   (Esperado: 10-15 minutos com otimização)')
    console.log('   (Antes: 67 minutos sem otimização)')
    console.log()
    
    const startTime = Date.now()
    
    const response = await axios.post(
      `${API_URL}/api/cron/jobs/${evaluateRulesJob._id}/trigger`,
      {},
      {
        validateStatus: () => true,
        timeout: 3600000  // 60 minutos timeout
      }
    )
    
    const duration = Math.round((Date.now() - startTime) / 1000)
    const durationMin = Math.floor(duration / 60)
    const durationSec = duration % 60
    
    console.log()
    console.log('═'.repeat(70))
    
    if (response.data.success) {
      console.log('✅ JOB EXECUTADO COM SUCESSO!')
      console.log('═'.repeat(70))
      console.log()
      console.log(`⏱️  Duração: ${durationMin}min ${durationSec}s`)
      console.log()
      
      if (response.data.data?.stats) {
        const stats = response.data.data.stats
        
        console.log('📊 ESTATÍSTICAS:')
        console.log(`   Total processado: ${stats.total || 0}`)
        console.log(`   Inseridos: ${stats.inserted || 0}`)
        console.log(`   Atualizados: ${stats.updated || 0}`)
        console.log(`   Erros: ${stats.errors || 0}`)
        console.log(`   Pulados: ${stats.skipped || 0}`)
        console.log()
      }
      
      // Análise de performance
      console.log('📈 ANÁLISE DE PERFORMANCE:')
      console.log()
      
      if (durationMin <= 15) {
        console.log('   ✅ EXCELENTE! Job executou em tempo esperado!')
        console.log('   ✅ Otimização funcionou corretamente!')
      } else if (durationMin <= 30) {
        console.log('   ⚠️  BOM mas pode melhorar')
        console.log('   ⚠️  Mais rápido que antes mas não otimal')
      } else {
        console.log('   ❌ AINDA MUITO LENTO!')
        console.log('   ❌ Otimização pode não ter sido aplicada')
        console.log('   ❌ Verificar logs do servidor')
      }
      
      console.log()
      console.log('═'.repeat(70))
      console.log()
      
      // Comparação
      const oldDuration = 67 * 60  // 67 minutos
      const improvement = Math.round((oldDuration / duration) * 10) / 10
      
      console.log('📊 COMPARAÇÃO:')
      console.log(`   ANTES: 67 minutos`)
      console.log(`   DEPOIS: ${durationMin}min ${durationSec}s`)
      console.log(`   MELHORIA: ${improvement}x mais rápido! 🚀`)
      console.log()
      
    } else {
      console.log('❌ JOB FALHOU!')
      console.log('═'.repeat(70))
      console.log()
      console.log(`   Erro: ${response.data.message || 'Erro desconhecido'}`)
      console.log()
      
      if (response.data.data?.errorMessage) {
        console.log(`   Detalhes: ${response.data.data.errorMessage}`)
        console.log()
      }
    }
    
    console.log(`📅 Fim: ${new Date().toLocaleString('pt-PT')}`)
    console.log()
    
  } catch (error: any) {
    console.error()
    console.error('═'.repeat(70))
    console.error('❌ ERRO FATAL')
    console.error('═'.repeat(70))
    console.error()
    console.error(`Erro: ${error.message}`)
    
    if (error.code === 'ECONNABORTED') {
      console.error()
      console.error('⚠️  Timeout: Job demorou mais de 60 minutos!')
      console.error('⚠️  Possível que otimização não foi aplicada')
    }
    
    console.error()
    process.exit(1)
  }
}

testEvaluateRules()