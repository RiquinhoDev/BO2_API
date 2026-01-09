/**
 * Teste de paralelização do STEP 4 (Tag Rules)
 *
 * Objetivo: Validar que o processamento em batches paralelos funciona
 * sem quebrar a lógica de tags.
 */

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'
import UserProduct from '../src/models/UserProduct'
import tagOrchestratorV2 from '../src/services/activeCampaign/tagOrchestrator.service'

async function testParallelProcessing() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('🧪 TESTE: STEP 4 PARALELO (Tag Rules)')
  console.log('════════════════════════════════════════════════════════════════')
  console.log('')

  try {
    // Conectar à BD
    console.log('📡 Conectando à BD...')
    const mongoUri = process.env.MONGO_URI || ''

    if (!mongoUri) {
      throw new Error('MONGO_URI não configurado')
    }

    await mongoose.connect(mongoUri)
    console.log('✅ Conectado à BD')
    console.log('')

    // Buscar UserProducts ACTIVE (limitado a 10 para teste rápido)
    console.log('🔍 Buscando UserProducts ACTIVE (limite: 10)...')
    const userProducts = await UserProduct.find({ status: 'ACTIVE' })
      .select('userId productId')
      .limit(10)
      .lean<{ userId: mongoose.Types.ObjectId; productId: mongoose.Types.ObjectId }[]>()

    console.log(`✅ ${userProducts.length} UserProducts encontrados`)
    console.log('')

    const items = userProducts.map((up) => ({
      userId: up.userId.toString(),
      productId: up.productId.toString()
    }))

    // Processar em batches paralelos (igual ao dailyPipeline.service.ts)
    console.log('🚀 Processando em batches paralelos...')
    console.log(`   Batch size: 20`)
    console.log(`   Total batches: ${Math.ceil(items.length / 20)}`)
    console.log('')

    const BATCH_SIZE = 20
    const orchestrationResults: any[] = []
    const startTime = Date.now()

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(items.length / BATCH_SIZE)

      console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} items)`)

      const batchStartTime = Date.now()

      // Processar batch em PARALELO
      const batchResults = await Promise.all(
        batch.map((item) =>
          tagOrchestratorV2.orchestrateUserProduct(item.userId, item.productId)
            .catch((error) => ({
              userId: item.userId,
              productId: item.productId,
              productCode: '',
              tagsApplied: [],
              tagsRemoved: [],
              communicationsTriggered: 0,
              success: false,
              error: error.message
            }))
        )
      )

      orchestrationResults.push(...batchResults)

      const batchDuration = Math.floor((Date.now() - batchStartTime) / 1000)

      // Log progresso
      const processed = Math.min(i + BATCH_SIZE, items.length)
      const percentage = ((processed / items.length) * 100).toFixed(1)
      console.log(`   ⏱️  Duração: ${batchDuration}s`)
      console.log(`   ⏳ Progresso: ${processed}/${items.length} (${percentage}%)`)
      console.log('')

      // Pequena pausa entre batches
      if (i + BATCH_SIZE < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    const totalDuration = Math.floor((Date.now() - startTime) / 1000)

    // Calcular estatísticas
    const stats = tagOrchestratorV2.getExecutionStats(orchestrationResults)

    const tagsApplied = orchestrationResults.reduce(
      (sum: number, r: any) => sum + (r.tagsApplied?.length || 0),
      0
    )

    const tagsRemoved = orchestrationResults.reduce(
      (sum: number, r: any) => sum + (r.tagsRemoved?.length || 0),
      0
    )

    console.log('════════════════════════════════════════════════════════════════')
    console.log('📊 RESULTADOS')
    console.log('════════════════════════════════════════════════════════════════')
    console.log(`⏱️  Duração total: ${totalDuration}s`)
    console.log(`📦 UserProducts processados: ${stats.total}`)
    console.log(`✅ Sucessos: ${stats.successful}`)
    console.log(`❌ Falhas: ${stats.failed}`)
    console.log(`🏷️  Tags aplicadas: ${tagsApplied}`)
    console.log(`🗑️  Tags removidas: ${tagsRemoved}`)
    console.log('')

    if (stats.failed > 0) {
      console.log('⚠️  Erros encontrados:')
      const errors = orchestrationResults.filter(r => !r.success)
      errors.slice(0, 5).forEach((err, i) => {
        console.log(`   ${i + 1}. ${err.error}`)
      })
      if (errors.length > 5) {
        console.log(`   ... e mais ${errors.length - 5} erros`)
      }
      console.log('')
    }

    console.log('════════════════════════════════════════════════════════════════')
    console.log('✅ TESTE FINALIZADO')
    console.log('════════════════════════════════════════════════════════════════')

    // Fechar conexão
    await mongoose.connection.close()
    console.log('🔌 Conexão BD fechada')

  } catch (error: any) {
    console.error('❌ Erro no teste:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Executar teste
testParallelProcessing()
  .then(() => {
    console.log('')
    console.log('✅ Script finalizado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error.message)
    process.exit(1)
  })
