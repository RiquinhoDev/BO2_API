// ════════════════════════════════════════════════════════════
// 📁 scripts/run-daily-pipeline-test.ts
// Executar APENAS STEP 5 do Daily Pipeline (Tag Rules)
// Garante que o Rui está na lista de UserProducts a processar
// ════════════════════════════════════════════════════════════

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'
import { Product, UserProduct, User, PipelineExecution } from '../src/models'
import tagOrchestratorV2 from '../src/services/activeCampaign/tagOrchestrator.service'
import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'
import { activeCampaignConfig, validateConfig } from '../src/config/activecampaign.config'
import fs from 'fs'
import path from 'path'

const RUI_EMAIL = 'marco_vidigal@hotmail.com'

async function main() {
  console.log('════════════════════════════════════════════════════════════')
  console.log('🧪 TESTE: Executar APENAS STEP 5 - Tag Rules (50 users + Rui)')
  console.log('════════════════════════════════════════════════════════════')
  console.log('')

  const startTime = Date.now()

  try {
    // ═══════════════════════════════════════════════════════════
    // SETUP: Conectar BD
    // ═══════════════════════════════════════════════════════════
    console.log('[SETUP] Conectando à BD...')
    const mongoUri = process.env.MONGODB_URI
    if (!mongoUri) throw new Error('MONGO_URI não configurado')

    await mongoose.connect(mongoUri)
    console.log('[SETUP] ✅ Conectado à BD\n')

    // ═══════════════════════════════════════════════════════════
    // VALIDAR CONFIGURAÇÃO DO ACTIVE CAMPAIGN
    // ═══════════════════════════════════════════════════════════
    console.log('[AC CONFIG] Validando configuração...')
    const configValid = validateConfig()
    console.log('[AC CONFIG] validateConfig():', configValid)
    console.log('[AC CONFIG] apiUrl:', activeCampaignConfig.apiUrl)
    console.log('[AC CONFIG] hasApiKey:', Boolean(activeCampaignConfig.apiKey))
    console.log('[AC CONFIG] axiosBaseURL:', activeCampaignService?.client?.defaults?.baseURL)

    if (!configValid) {
      throw new Error('Configuração AC inválida! Verifique AC_BASE_URL e AC_API_KEY no .env')
    }
    console.log('[AC CONFIG] ✅ Configuração válida\n')

    // ═══════════════════════════════════════════════════════════
    // STEP 5/5: EVALUATE TAG RULES
    // ═══════════════════════════════════════════════════════════
    console.log('[STEP 5] 🚀 Iniciando avaliação de Tag Rules...\n')
    const step5Start = Date.now()

    // Configuração do filtro OGI
    const cutoffDate = new Date('2024-12-31T23:59:59Z')
    const inactiveDaysThreshold = 380
    const cutoffActivityDate = new Date()
    cutoffActivityDate.setDate(cutoffActivityDate.getDate() - inactiveDaysThreshold)

    // Buscar produto OGI_V1
    const ogiProduct = await Product.findOne({ code: 'OGI_V1' }).select('_id').lean() as { _id: any } | null
    const ogiProductId = ogiProduct?._id?.toString()

    // ═══════════════════════════════════════════════════════════
    // BUSCAR RUI PRIMEIRO (garantir que está na lista)
    // ═══════════════════════════════════════════════════════════
    console.log(`[RUI] 🎯 Buscando Rui (${RUI_EMAIL})...`)
    const ruiUser = await User.findOne({ email: RUI_EMAIL }).lean<any>()

    if (!ruiUser) {
      throw new Error(`User Rui (${RUI_EMAIL}) não encontrado na BD!`)
    }
    console.log(`[RUI] ✅ Rui encontrado: ${ruiUser._id}`)

    // Buscar UserProducts do Rui
    const ruiUserProducts = await UserProduct.find({
      userId: ruiUser._id,
      status: 'ACTIVE'
    }).select('userId productId metadata engagement').lean<any[]>()

    console.log(`[RUI] ✅ ${ruiUserProducts.length} UserProducts ativos do Rui\n`)

    // ═══════════════════════════════════════════════════════════
    // BUSCAR OUTROS UserProducts (49 para completar 50)
    // ═══════════════════════════════════════════════════════════
    const TEST_LIMIT = 50
    const ruiUserProductIds = ruiUserProducts.map(up => up._id.toString())

    const otherUserProducts = await UserProduct.find({
      status: 'ACTIVE',
      _id: { $nin: ruiUserProductIds } // Excluir os do Rui (já temos)
    })
      .limit(TEST_LIMIT - ruiUserProducts.length)
      .select('userId productId metadata engagement')
      .populate({
        path: 'userId',
        select: 'email hotmart.lastAccessDate hotmart.firstAccessDate hotmart.progress.lastAccessDate metadata.purchaseDate'
      })
      .lean<any[]>()

    // Combinar: Rui primeiro + outros
    // Precisamos popular o userId do Rui também
    const ruiUserProductsPopulated = await UserProduct.find({
      _id: { $in: ruiUserProductIds }
    })
      .select('userId productId metadata engagement')
      .populate({
        path: 'userId',
        select: 'email hotmart.lastAccessDate hotmart.firstAccessDate hotmart.progress.lastAccessDate metadata.purchaseDate'
      })
      .lean<any[]>()

    const allUserProducts = [...ruiUserProductsPopulated, ...otherUserProducts]

    console.log(`[STEP 5] 📊 Total UserProducts: ${allUserProducts.length}`)
    console.log(`   - Rui: ${ruiUserProductsPopulated.length}`)
    console.log(`   - Outros: ${otherUserProducts.length}\n`)

    // ═══════════════════════════════════════════════════════════
    // FILTRAR UserProducts ÓRFÃOS
    // ═══════════════════════════════════════════════════════════
    const validUserProducts = allUserProducts.filter((up) => {
      if (!up.userId || !up.userId._id) {
        console.log(`⚠️  UserProduct ${up._id} órfão (userId null) - ignorado`)
        return false
      }
      return true
    })

    const orphanCount = allUserProducts.length - validUserProducts.length
    if (orphanCount > 0) {
      console.log(`   ⚠️  ${orphanCount} UserProducts órfãos ignorados`)
    }

    // ═══════════════════════════════════════════════════════════
    // FILTRAR OGI_V1 INATIVOS (mas NUNCA filtrar o Rui)
    // ═══════════════════════════════════════════════════════════
    const filteredUserProducts = validUserProducts.filter((up) => {
      const productId = up.productId?.toString()
      const userEmail = up.userId?.email

      // NUNCA filtrar o Rui
      if (userEmail === RUI_EMAIL) {
        return true
      }

      // Se não é OGI_V1, incluir sempre
      if (!ogiProductId || productId !== ogiProductId) {
        return true
      }

      // É OGI_V1 → aplicar filtros
      const user = up.userId

      const lastAccessDate =
        user?.hotmart?.lastAccessDate ||
        user?.hotmart?.progress?.lastAccessDate ||
        user?.hotmart?.firstAccessDate

      const purchaseDate = user?.metadata?.purchaseDate || up.metadata?.purchaseDate

      // Filtro 1: Compra antes de 31/12/2024
      if (purchaseDate && new Date(purchaseDate) < cutoffDate) {
        return false
      }

      // Filtro 2: Último acesso > 380 dias
      if (lastAccessDate && new Date(lastAccessDate) < cutoffActivityDate) {
        return false
      }

      return true
    })

    const filteredCount = validUserProducts.length - filteredUserProducts.length
    if (filteredCount > 0) {
      console.log(`   🔍 Filtrados ${filteredCount} alunos inativos do OGI_V1 (>380 dias ou compra <31/12/2024)`)
    }

    // ═══════════════════════════════════════════════════════════
    // PREPARAR ITEMS PARA PROCESSAMENTO
    // ═══════════════════════════════════════════════════════════
    const items = filteredUserProducts
      .filter(up => up.userId && up.userId._id)
      .map((up) => ({
        userId: up.userId._id?.toString() || up.userId.toString(),
        productId: up.productId.toString(),
        email: up.userId?.email || 'N/A'
      }))

    console.log(`\n[STEP 5] 🎯 Processando ${items.length} UserProducts...\n`)

    // ═══════════════════════════════════════════════════════════
    // PROCESSAMENTO SEQUENCIAL
    // ═══════════════════════════════════════════════════════════
    const orchestrationResults: any[] = []
    let lastLoggedPercent = 0

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const isRui = item.email === RUI_EMAIL

      if (isRui) {
        console.log(`   🎯 [${i + 1}/${items.length}] Processando RUI (${item.email})...`)
      }

      const result = await tagOrchestratorV2.orchestrateUserProduct(item.userId, item.productId)
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

      orchestrationResults.push({ ...result, email: item.email })

      if (isRui) {
        console.log(`   🎯 RUI resultado:`)
        console.log(`      - Success: ${result.success}`)
        console.log(`      - Tags Applied: ${result.tagsApplied?.length || 0}`, result.tagsApplied)
        console.log(`      - Tags Removed: ${result.tagsRemoved?.length || 0}`, result.tagsRemoved)
        if (result.error) {
          console.log(`      - Error: ${result.error}`)
        }
        console.log('')
      }

      // Log a cada 10% de progresso
      const processed = orchestrationResults.length
      const percentage = Math.floor((processed / items.length) * 100)

      if (percentage >= lastLoggedPercent + 10 || processed === items.length) {
        const elapsed = (Date.now() - step5Start) / 1000
        const avgTimePerItem = elapsed / processed
        const remaining = items.length - processed
        const etaMin = Math.floor((avgTimePerItem * remaining) / 60)
        console.log(`   → ${percentage}% (${processed}/${items.length}) | ETA: ~${etaMin}min`)
        lastLoggedPercent = percentage
      }
    }

    // ═══════════════════════════════════════════════════════════
    // GUARDAR RESULTADOS EM JSON
    // ═══════════════════════════════════════════════════════════
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outputDir = path.join(process.cwd(), 'pipeline-results')

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      const detailedResults = orchestrationResults.map((r, idx) => ({
        index: idx + 1,
        userId: r.userId,
        userEmail: r.email,
        productId: r.productId,
        productCode: r.productCode,
        success: r.success,
        tagsApplied: r.tagsApplied || [],
        tagsRemoved: r.tagsRemoved || [],
        communicationsTriggered: r.communicationsTriggered || 0,
        error: r.error || null,
        isRui: r.email === RUI_EMAIL
      }))

      const jsonOutput = {
        testInfo: {
          timestamp: new Date().toISOString(),
          testLimit: TEST_LIMIT,
          totalProcessed: orchestrationResults.length,
          duration: Math.floor((Date.now() - step5Start) / 1000),
          ruiIncluded: true
        },
        summary: {
          successful: orchestrationResults.filter(r => r.success).length,
          failed: orchestrationResults.filter(r => !r.success).length,
          totalTagsApplied: orchestrationResults.reduce((sum, r) => sum + (r.tagsApplied?.length || 0), 0),
          totalTagsRemoved: orchestrationResults.reduce((sum, r) => sum + (r.tagsRemoved?.length || 0), 0)
        },
        ruiResults: detailedResults.filter(r => r.isRui),
        results: detailedResults,
        errors: orchestrationResults.filter(r => r.error).map(r => ({
          userId: r.userId,
          email: r.email,
          productCode: r.productCode,
          error: r.error
        }))
      }

      const filename = `pipeline-step5-test-${timestamp}.json`
      const filepath = path.join(outputDir, filename)

      fs.writeFileSync(filepath, JSON.stringify(jsonOutput, null, 2), 'utf-8')

      console.log(`\n   💾 Resultados guardados: ${filepath}`)
    } catch (saveError: any) {
      console.error(`   ❌ Erro ao guardar JSON: ${saveError.message}`)
    }

    // ═══════════════════════════════════════════════════════════
    // RESUMO FINAL
    // ═══════════════════════════════════════════════════════════
    const tagsApplied = orchestrationResults.reduce(
      (sum: number, r: any) => sum + (r.tagsApplied?.length || 0),
      0
    )

    const tagsRemoved = orchestrationResults.reduce(
      (sum: number, r: any) => sum + (r.tagsRemoved?.length || 0),
      0
    )

    const successful = orchestrationResults.filter(r => r.success).length
    const failed = orchestrationResults.filter(r => !r.success).length

    const duration = Math.floor((Date.now() - startTime) / 1000)
    const durationMin = Math.floor(duration / 60)
    const durationSec = duration % 60

    console.log('\n════════════════════════════════════════════════════════════')
    console.log('✅ STEP 5 COMPLETO')
    console.log('════════════════════════════════════════════════════════════')
    console.log(`Duração: ${durationMin}min ${durationSec}s`)
    console.log('')
    console.log('📊 RESUMO:')
    console.log(`   Total processados: ${orchestrationResults.length}`)
    console.log(`   Sucesso: ${successful}`)
    console.log(`   Falhas: ${failed}`)
    console.log(`   Tags aplicadas: +${tagsApplied}`)
    console.log(`   Tags removidas: -${tagsRemoved}`)
    console.log('')

    // Mostrar resultado do Rui em destaque
    const ruiResults = orchestrationResults.filter(r => r.email === RUI_EMAIL)
    if (ruiResults.length > 0) {
      console.log('🎯 RESULTADO DO RUI:')
      ruiResults.forEach(r => {
        console.log(`   - Product: ${r.productCode}`)
        console.log(`   - Success: ${r.success}`)
        console.log(`   - Tags Applied: ${r.tagsApplied?.join(', ') || 'nenhuma'}`)
        console.log(`   - Tags Removed: ${r.tagsRemoved?.join(', ') || 'nenhuma'}`)
      })
    }

    console.log('════════════════════════════════════════════════════════════')

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n[SETUP] Desconectado da BD')
    process.exit(0)
  }
}

main()
