// ════════════════════════════════════════════════════════════
// 🔍 DEBUG DIRETO: ResetCounters - Executar localmente
// Executa o job DIRETAMENTE sem passar pela API
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'

// Configurar ambiente
dotenv.config()

async function runDirectly() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('🔍 DEBUG DIRETO: ResetCounters')
  console.log('═'.repeat(70))
  console.log()
  
  try {
    // 1. Conectar MongoDB
    console.log('📡 Conectando ao MongoDB...')
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/riquinhos'
    
    await mongoose.connect(mongoUri)
    console.log('✅ MongoDB conectado')
    console.log()
    
    // 2. Importar job
    console.log('📦 Importando job ResetCounters...')
    const resetCountersJob = await import('../src/jobs/resetCounters.job')
    console.log('✅ Job importado')
    console.log()
    
    // 3. Executar
    console.log('═'.repeat(70))
    console.log('🔄 EXECUTANDO JOB DIRETAMENTE...')
    console.log('═'.repeat(70))
    console.log()
    
    const startTime = Date.now()
    
    const result = await resetCountersJob.default.run()
    
    const duration = Math.round((Date.now() - startTime) / 1000)
    
    console.log()
    console.log('═'.repeat(70))
    console.log('✅ JOB COMPLETO!')
    console.log('═'.repeat(70))
    console.log()
    console.log(`⏱️  Duração: ${duration}s`)
    console.log()
    console.log('📊 RESULTADO:')
    console.log(JSON.stringify(result, null, 2))
    console.log()
    
    // 4. Fechar conexão
    await mongoose.connection.close()
    console.log('✅ MongoDB desconectado')
    
  } catch (error: any) {
    console.error()
    console.error('═'.repeat(70))
    console.error('❌ ERRO!')
    console.error('═'.repeat(70))
    console.error()
    console.error('Mensagem:', error.message)
    console.error()
    console.error('Stack trace:')
    console.error(error.stack)
    console.error()
    
    // Fechar conexão mesmo com erro
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close()
    }
    
    process.exit(1)
  }
}

runDirectly()