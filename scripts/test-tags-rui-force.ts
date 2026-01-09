/**
 * 🧪 TESTE: FORÇAR Aplicação de TODAS as Tags BO do Rui
 *
 * Objetivo: Testar addTag() e removeTag() SEM avaliar regras
 *
 * Fluxo:
 * 1. Buscar TODAS as TagRules dos produtos do Rui
 * 2. APLICAR TODAS as tags FORÇADAMENTE (ignorar condições)
 * 3. Verificar no AC
 */

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'

import UserProduct from '../src/models/UserProduct'

import Course from '../src/models/Course'
import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'
import { TagRule, User } from '../src/models'

const RUI_EMAIL = 'ruifilipespteixeira@gmail.com'

async function testForceApplyTags() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('🧪 TESTE: FORÇAR Aplicação de TODAS as Tags BO')
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
    // FASE 2: BUSCAR TODAS AS TAGRULES E APLICAR FORÇADAMENTE
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('🏷️  FASE: APLICAR TODAS AS TAGS (FORÇADO - SEM AVALIAR REGRAS)')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    const allTagsToApply: string[] = []
    const applyResults = []

    for (let i = 0; i < userProducts.length; i++) {
      const up = userProducts[i]
      const product = up.productId as any

      console.log(`[${i + 1}/${userProducts.length}] 📦 Produto: ${product.code}`)
      console.log('')

      // Buscar Course
      const course = await Course.findOne({ code: product.courseCode || product.code })

      if (!course) {
        console.log(`   ⚠️  Course não encontrado para ${product.courseCode || product.code}`)
        console.log('')
        continue
      }

      console.log(`   ✅ Course encontrado: ${course.name}`)

      // Buscar TODAS as TagRules deste curso
      const tagRules = await TagRule.find({
        courseId: course._id,
        isActive: true
      })

      console.log(`   📊 TagRules encontradas: ${tagRules.length}`)
      console.log('')

      if (tagRules.length === 0) {
        console.log(`   ⚠️  Nenhuma TagRule ativa`)
        console.log('')
        continue
      }

      // Aplicar TODAS as tags FORÇADAMENTE
      for (let j = 0; j < tagRules.length; j++) {
        const rule = tagRules[j]
        const tagName = rule.actions?.addTag // ✅ Campo correto: actions.addTag

        if (!tagName) {
          console.log(`   [${j + 1}/${tagRules.length}] ⚠️  Regra sem tag (pulando)`)
          continue
        }

        console.log(`   [${j + 1}/${tagRules.length}] 🏷️  Aplicando: "${tagName}"`)

        try {
          // ✅ FORÇAR aplicação (via applyTagToUserProduct)
          const applied = await activeCampaignService.applyTagToUserProduct(
            user.id.toString(),
            product._id.toString(),
            tagName
          )

          if (applied) {
            console.log(`      ✅ Tag aplicada ao AC + BD`)
            allTagsToApply.push(tagName)
            applyResults.push({ tag: tagName, success: true, product: product.code })
          } else {
            console.log(`      ❌ Falha ao aplicar tag`)
            applyResults.push({ tag: tagName, success: false, product: product.code })
          }

          // Pausa para não atingir rate limit
          await new Promise(resolve => setTimeout(resolve, 300))

        } catch (error: any) {
          console.log(`      ❌ Erro: ${error.message}`)
          applyResults.push({ tag: tagName, success: false, product: product.code })
        }
      }

      console.log('')
    }

    // ═══════════════════════════════════════════════════════════
    // RESUMO
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('📊 RESUMO - APLICAÇÃO FORÇADA')
    console.log('════════════════════════════════════════════════════════════════')

    const successes = applyResults.filter(r => r.success).length
    const failures = applyResults.filter(r => !r.success).length

    console.log(`✅ Sucessos: ${successes}/${applyResults.length}`)
    console.log(`❌ Falhas: ${failures}/${applyResults.length}`)
    console.log('')

    console.log('Tags aplicadas por produto:')
    const byProduct = new Map<string, number>()
    applyResults.forEach(r => {
      if (r.success) {
        byProduct.set(r.product, (byProduct.get(r.product) || 0) + 1)
      }
    })

    byProduct.forEach((count, product) => {
      console.log(`   ${product}: ${count} tags`)
    })

    console.log('')

    // ═══════════════════════════════════════════════════════════
    // VERIFICAR TAGS NO AC
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('🔍 VERIFICANDO TAGS NO ACTIVE CAMPAIGN')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    // Aguardar 3s para AC processar
    console.log('⏱️  Aguardando 3s para AC processar...')
    await new Promise(resolve => setTimeout(resolve, 3000))

    const acTags = await activeCampaignService.getContactTagsByEmail(RUI_EMAIL)

    // Filtrar apenas tags BO (pattern: ^[A-Z_0-9]+ - .+$)
    const boTags = acTags.filter(tag => /^[A-Z_0-9]+ - .+$/.test(tag))

    console.log(`📊 Total tags no AC: ${acTags.length}`)
    console.log(`🏷️  Tags BO: ${boTags.length}`)
    console.log('')

    if (boTags.length > 0) {
      console.log('Tags BO encontradas no AC:')
      boTags.forEach((tag, i) => {
        const wasApplied = allTagsToApply.includes(tag)
        const marker = wasApplied ? '✅' : '⚠️ '
        console.log(`   ${i + 1}. ${marker} ${tag}`)
      })
    } else {
      console.log('⚠️  Nenhuma tag BO encontrada no AC')
    }

    console.log('')

    // ═══════════════════════════════════════════════════════════
    // FINAL
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('✅ TESTE COMPLETO - TAGS APLICADAS FORÇADAMENTE')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')
    console.log(`✅ ${successes} tags foram aplicadas ao Rui no Active Campaign`)
    console.log('✅ Podes verificar no AC se as tags estão corretas')
    console.log('')
    console.log('💡 Para REMOVER todas as tags BO, executa:')
    console.log('   npm run test:tags-rui:remove')
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
testForceApplyTags()
  .then(() => {
    console.log('')
    console.log('✅ Script finalizado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error.message)
    process.exit(1)
  })
