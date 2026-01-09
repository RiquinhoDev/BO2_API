/**
 * 🧪 TESTE: Aplicar e Remover TODAS as Tags BO do Rui
 *
 * Objetivo: Validar que addTag() e removeTag() funcionam corretamente
 *
 * Fluxo:
 * 1. Buscar UserProducts do Rui
 * 2. Aplicar TODAS as tags BO (via TagOrchestrator)
 * 3. Aguardar confirmação do user
 * 4. Remover TODAS as tags BO
 */

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'

import UserProduct from '../src/models/UserProduct'
import Product from '../src/models/product/Product'
import tagOrchestratorV2 from '../src/services/activeCampaign/tagOrchestrator.service'
import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'
import { User } from '../src/models'

const RUI_EMAIL = 'ruifilipespteixeira@gmail.com'

async function testTagsRui() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('🧪 TESTE: Tags BO - Aplicar e Remover (Rui)')
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
    // FASE 1: BUSCAR DADOS DO RUI
    // ═══════════════════════════════════════════════════════════

    console.log('🔍 Buscando dados do Rui...')
    const user = await User.findOne({ email: RUI_EMAIL })

    if (!user) {
      throw new Error(`User ${RUI_EMAIL} não encontrado`)
    }

    console.log(`✅ User encontrado: ${user.name}`)
    console.log(`   ID: ${user._id}`)
    console.log('')

    // Buscar UserProducts
    const userProducts = await UserProduct.find({
      userId: user._id,
      status: 'ACTIVE'
    }).populate('productId')

    console.log(`📦 UserProducts ACTIVE: ${userProducts.length}`)
    for (const up of userProducts) {
      const product = up.productId as any
      console.log(`   - ${product.name} (${product.code})`)
    }
    console.log('')

    if (userProducts.length === 0) {
      console.log('⚠️  Nenhum UserProduct ativo encontrado')
      return
    }

    // ═══════════════════════════════════════════════════════════
    // FASE 2: APLICAR TODAS AS TAGS (via TagOrchestrator)
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('📝 FASE 1: APLICAR TODAS AS TAGS BO')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    const applyResults = []

    for (let i = 0; i < userProducts.length; i++) {
      const up = userProducts[i]
      const product = up.productId as any

      console.log(`[${i + 1}/${userProducts.length}] 🏷️  Processando: ${product.code}`)
      console.log('')

      try {
        // TagOrchestrator faz TUDO: avalia regras, aplica tags, remove antigas
        const result = await tagOrchestratorV2.orchestrateUserProduct(
          user.id.toString(),
          product._id.toString()
        )

        applyResults.push({
          product: product.code,
          success: result.success,
          tagsApplied: result.tagsApplied,
          tagsRemoved: result.tagsRemoved,
          error: result.error
        })

        if (result.success) {
          console.log(`   ✅ Sucesso!`)
          console.log(`      Tags aplicadas: ${result.tagsApplied.length}`)
          if (result.tagsApplied.length > 0) {
            result.tagsApplied.forEach(tag => console.log(`         + ${tag}`))
          }
          console.log(`      Tags removidas: ${result.tagsRemoved.length}`)
          if (result.tagsRemoved.length > 0) {
            result.tagsRemoved.forEach(tag => console.log(`         - ${tag}`))
          }
        } else {
          console.log(`   ❌ Erro: ${result.error}`)
        }

        console.log('')

        // Pequena pausa entre produtos
        if (i < userProducts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

      } catch (error: any) {
        console.log(`   ❌ Erro: ${error.message}`)
        console.log('')
        applyResults.push({
          product: product.code,
          success: false,
          tagsApplied: [],
          tagsRemoved: [],
          error: error.message
        })
      }
    }

    // Resumo
    console.log('════════════════════════════════════════════════════════════════')
    console.log('📊 RESUMO - APLICAR TAGS')
    console.log('════════════════════════════════════════════════════════════════')

    const totalApplied = applyResults.reduce((sum, r) => sum + r.tagsApplied.length, 0)
    const totalRemoved = applyResults.reduce((sum, r) => sum + r.tagsRemoved.length, 0)
    const successes = applyResults.filter(r => r.success).length
    const failures = applyResults.filter(r => !r.success).length

    console.log(`✅ Sucessos: ${successes}/${userProducts.length}`)
    console.log(`❌ Falhas: ${failures}/${userProducts.length}`)
    console.log(`🏷️  Tags aplicadas: ${totalApplied}`)
    console.log(`🗑️  Tags removidas: ${totalRemoved}`)
    console.log('')

    // Mostrar detalhes
    applyResults.forEach(r => {
      const status = r.success ? '✅' : '❌'
      console.log(`${status} ${r.product}: +${r.tagsApplied.length} tags, -${r.tagsRemoved.length} tags`)
    })
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // VERIFICAR TAGS NO AC
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('🔍 VERIFICANDO TAGS NO ACTIVE CAMPAIGN')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    const acTags = await activeCampaignService.getContactTagsByEmail(RUI_EMAIL)

    // Filtrar apenas tags BO (pattern: ^[A-Z_0-9]+ - .+$)
    const boTags = acTags.filter(tag => /^[A-Z_0-9]+ - .+$/.test(tag))

    console.log(`📊 Total tags no AC: ${acTags.length}`)
    console.log(`🏷️  Tags BO: ${boTags.length}`)
    console.log('')

    if (boTags.length > 0) {
      console.log('Tags BO encontradas:')
      boTags.forEach((tag, i) => {
        console.log(`   ${i + 1}. ${tag}`)
      })
    } else {
      console.log('⚠️  Nenhuma tag BO encontrada no AC')
    }

    console.log('')

    // ═══════════════════════════════════════════════════════════
    // AGUARDAR CONFIRMAÇÃO DO USER
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('⏸️  TESTE COMPLETO - TAGS APLICADAS')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')
    console.log('✅ Tags foram aplicadas ao Rui no Active Campaign')
    console.log('✅ Podes verificar no AC se as tags estão corretas')
    console.log('')
    console.log('💡 Para REMOVER todas as tags BO, executa:')
    console.log('   npx tsx scripts/test-tags-rui-remove.ts')
    console.log('')
    console.log('════════════════════════════════════════════════════════════════')

  } catch (error: any) {
    console.error('❌ Erro no teste:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('🔌 Conexão BD fechada')
  }
}

// Executar teste
testTagsRui()
  .then(() => {
    console.log('')
    console.log('✅ Script finalizado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error.message)
    process.exit(1)
  })
