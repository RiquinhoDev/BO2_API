/**
 * 🗑️  TESTE: REMOVER TODAS as Tags BO do Rui
 *
 * Objetivo: Limpar todas as tags BO do Active Campaign
 *
 * Fluxo:
 * 1. Buscar todas as tags BO do Rui no AC
 * 2. Remover TODAS elas (via removeTag)
 * 3. Limpar BD também
 */

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'

import UserProduct from '../src/models/UserProduct'
import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'
import { User } from '../src/models'

const RUI_EMAIL = 'ruifilipespteixeira@gmail.com'

async function removeAllTagsRui() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('🗑️  TESTE: REMOVER TODAS as Tags BO (Rui)')
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
    // FASE 1: BUSCAR TAGS NO AC
    // ═══════════════════════════════════════════════════════════

    console.log('🔍 Buscando user...')
    const user = await User.findOne({ email: RUI_EMAIL })

    if (!user) {
      throw new Error(`User ${RUI_EMAIL} não encontrado`)
    }

    console.log(`✅ User encontrado: ${user.name}`)
    console.log('')

    console.log('📡 Buscando tags no Active Campaign...')
    const acTags = await activeCampaignService.getContactTagsByEmail(RUI_EMAIL)

    // Filtrar apenas tags BO (pattern: ^[A-Z_0-9]+ - .+$)
    const boTags = acTags.filter(tag => /^[A-Z_0-9]+ - .+$/.test(tag))

    console.log(`📊 Total tags no AC: ${acTags.length}`)
    console.log(`🏷️  Tags BO: ${boTags.length}`)
    console.log('')

    if (boTags.length === 0) {
      console.log('✅ Nenhuma tag BO encontrada - nada a remover')
      return
    }

    console.log('Tags BO a remover:')
    boTags.forEach((tag, i) => {
      console.log(`   ${i + 1}. ${tag}`)
    })
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // FASE 2: REMOVER TODAS AS TAGS
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('🗑️  REMOVENDO TODAS AS TAGS BO')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    const removeResults = []

    for (let i = 0; i < boTags.length; i++) {
      const tag = boTags[i]

      console.log(`[${i + 1}/${boTags.length}] 🗑️  Removendo: "${tag}"`)

      try {
        const removed = await activeCampaignService.removeTag(RUI_EMAIL, tag)

        removeResults.push({
          tag,
          success: removed
        })

        if (removed) {
          console.log(`   ✅ Tag removida do AC`)
        } else {
          console.log(`   ⚠️  Tag não foi removida (pode não existir)`)
        }

        // Pausa entre remoções
        if (i < boTags.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }

      } catch (error: any) {
        console.log(`   ❌ Erro: ${error.message}`)
        removeResults.push({
          tag,
          success: false
        })
      }

      console.log('')
    }

    // ═══════════════════════════════════════════════════════════
    // FASE 3: LIMPAR BD TAMBÉM
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('🧹 LIMPANDO TAGS DA BD')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    const userProducts = await UserProduct.find({
      userId: user._id
    })

    console.log(`📦 ${userProducts.length} UserProducts a limpar`)
    console.log('')

    let totalCleaned = 0

    for (const up of userProducts) {
      const tagsBefore = up.activeCampaignData?.tags || []

      if (tagsBefore.length > 0) {
        // Limpar todas as tags
        await UserProduct.findByIdAndUpdate(up._id, {
          $set: {
            'activeCampaignData.tags': [],
            'activeCampaignData.lastSyncAt': new Date()
          }
        })

        totalCleaned += tagsBefore.length
        console.log(`   ✅ UserProduct ${up._id}: ${tagsBefore.length} tags limpas`)
      }
    }

    console.log('')
    console.log(`✅ Total de tags limpas da BD: ${totalCleaned}`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // RESUMO FINAL
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('📊 RESUMO - REMOÇÃO DE TAGS')
    console.log('════════════════════════════════════════════════════════════════')

    const successes = removeResults.filter(r => r.success).length
    const failures = removeResults.filter(r => !r.success).length

    console.log(`✅ Removidas do AC: ${successes}/${boTags.length}`)
    console.log(`❌ Falhas: ${failures}/${boTags.length}`)
    console.log(`🧹 Limpas da BD: ${totalCleaned} tags`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // VERIFICAR SE LIMPOU TUDO
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('🔍 VERIFICAÇÃO FINAL')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    console.log('📡 Buscando tags no AC novamente...')
    const acTagsAfter = await activeCampaignService.getContactTagsByEmail(RUI_EMAIL)
    const boTagsAfter = acTagsAfter.filter(tag => /^[A-Z_0-9]+ - .+$/.test(tag))

    console.log(`📊 Tags BO restantes no AC: ${boTagsAfter.length}`)

    if (boTagsAfter.length > 0) {
      console.log('')
      console.log('⚠️  Ainda há tags BO no AC:')
      boTagsAfter.forEach((tag, i) => {
        console.log(`   ${i + 1}. ${tag}`)
      })
      console.log('')
      console.log('💡 Podem ser tags com cache do AC - aguardar alguns minutos')
    } else {
      console.log('✅ TODAS as tags BO foram removidas do AC!')
    }

    console.log('')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('✅ LIMPEZA COMPLETA')
    console.log('════════════════════════════════════════════════════════════════')

  } catch (error: any) {
    console.error('❌ Erro no teste:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('')
    console.log('🔌 Conexão BD fechada')
  }
}

// Executar teste
removeAllTagsRui()
  .then(() => {
    console.log('')
    console.log('✅ Script finalizado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error.message)
    process.exit(1)
  })
