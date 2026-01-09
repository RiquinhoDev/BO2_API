/**
 * 🧪 TEST: Nova Arquitetura com Pré-Criação de Tags
 *
 * Testa o fluxo completo da nova arquitetura:
 * 1. Pré-criar todas as tags BO na AC
 * 2. Executar tag orchestrator para Rui
 * 3. Verificar que tags foram aplicadas/removidas
 */

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'
import { User } from '../src/models'
import UserProduct from '../src/models/UserProduct'
import tagPreCreationService from '../src/services/activeCampaign/tagPreCreation.service'
import { tagOrchestratorV2 } from '../src/services/activeCampaign/tagOrchestrator.service'

const RUI_EMAIL = 'ruifilipespteixeira@gmail.com'

async function testNewArchitecture() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('🧪 TESTE: Nova Arquitetura com Pré-Criação de Tags')
  console.log('════════════════════════════════════════════════════════════════')
  console.log('')

  try {
    // Conectar BD
    console.log('📡 Conectando à BD...')
    const mongoUri = process.env.MONGO_URI || ''
    if (!mongoUri) throw new Error('MONGO_URI não configurado')

    await mongoose.connect(mongoUri)
    console.log('✅ Conectado à BD')
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // STEP 1: PRÉ-CRIAR TAGS BO
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('🏷️  STEP 1: Pré-criar Tags BO')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    const preCreateResult = await tagPreCreationService.preCreateBOTags()

    console.log(`✅ Pré-criação completa:`)
    console.log(`   Total tags: ${preCreateResult.totalTags}`)
    console.log(`   Cache IDs: ${preCreateResult.tagCache.size}`)
    console.log(`   Falhas: ${preCreateResult.failed.length}`)
    console.log(`   Duração: ${preCreateResult.duration}s`)
    console.log('')

    if (preCreateResult.failed.length > 0) {
      console.log('⚠️  Tags que falharam:')
      preCreateResult.failed.forEach(tag => console.log(`   - ${tag}`))
      console.log('')
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 2: BUSCAR RUI NA BD
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('👤 STEP 2: Buscar Rui na BD')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    const user = await User.findOne({ email: RUI_EMAIL })

    if (!user) {
      throw new Error(`User não encontrado: ${RUI_EMAIL}`)
    }

    console.log(`✅ User encontrado: ${user.name}`)
    console.log(`   ID: ${user._id}`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // STEP 3: BUSCAR USERPRODUCTS
    // ═══════════════════════════════════════════════════════════

    const userProducts = await UserProduct.find({
      userId: String(user._id),
      status: 'ACTIVE'
    }).populate('productId')

    console.log(`📦 UserProducts ativos: ${userProducts.length}`)
    userProducts.forEach(up => {
      const product = up.productId as any
      console.log(`   • ${product?.name} (${product?.code})`)
    })
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // STEP 4: EXECUTAR TAG ORCHESTRATOR PARA CADA PRODUTO
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('🎯 STEP 3: Executar Tag Orchestrator')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    for (let i = 0; i < userProducts.length; i++) {
      const up = userProducts[i]
      const product = up.productId as any

      console.log(`[${i + 1}/${userProducts.length}] 🔄 Processando: ${product?.name}`)
      console.log('─'.repeat(64))

      try {
        const result = await tagOrchestratorV2.orchestrateUserProduct(
          String(user._id),
          String(product._id)
        )

        console.log(`✅ Sucesso!`)
        console.log(`   Tags aplicadas: ${result.tagsApplied?.length || 0}`)
        if (result.tagsApplied && result.tagsApplied.length > 0) {
          result.tagsApplied.forEach((tag: string) => {
            console.log(`      + ${tag}`)
          })
        }

        console.log(`   Tags removidas: ${result.tagsRemoved?.length || 0}`)
        if (result.tagsRemoved && result.tagsRemoved.length > 0) {
          result.tagsRemoved.forEach((tag: string) => {
            console.log(`      - ${tag}`)
          })
        }

        console.log(`   Comunicações: ${result.communicationsTriggered || 0}`)
        console.log('')

      } catch (error: any) {
        console.error(`❌ Erro: ${error.message}`)
        console.log('')
      }
    }

    // ═══════════════════════════════════════════════════════════
    // FINALIZAR
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('✅ TESTE COMPLETO!')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')
    console.log('Agora execute: npm run list:rui-tags')
    console.log('Para ver o estado AFTER')
    console.log('')

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    if (error.response) {
      console.error('Status:', error.response.status)
      console.error('Data:', JSON.stringify(error.response.data, null, 2))
    }
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('🔌 Conexão BD fechada')
  }
}

// Executar
testNewArchitecture()
  .then(() => {
    console.log('')
    console.log('✅ Script finalizado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error.message)
    process.exit(1)
  })
