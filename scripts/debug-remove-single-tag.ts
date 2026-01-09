/**
 * 🐛 DEBUG: Remover UMA tag do Rui (com logs detalhados)
 *
 * Testar removeTag() com TODOS os logs
 */

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'

import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'
import { User } from '../src/models'

const RUI_EMAIL = 'ruifilipespteixeira@gmail.com'
const TAG_TO_REMOVE = 'OGI_V1 - Inativo 10d' // Escolher uma tag que existe

async function debugRemoveSingleTag() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('🐛 DEBUG: Remover UMA Tag do Rui')
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

    // Buscar user
    console.log('🔍 Buscando user...')
    const user = await User.findOne({ email: RUI_EMAIL })

    if (!user) {
      throw new Error(`User ${RUI_EMAIL} não encontrado`)
    }

    console.log(`✅ User encontrado: ${user.name}`)
    console.log('')

    // Ver tags ANTES
    console.log('════════════════════════════════════════════════════════════════')
    console.log('📊 TAGS ANTES DA REMOÇÃO')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    const tagsBefore = await activeCampaignService.getContactTagsByEmail(RUI_EMAIL)
    const boTagsBefore = tagsBefore.filter(tag => /^[A-Z_0-9]+ - .+$/.test(tag))

    console.log(`📊 Total tags: ${tagsBefore.length}`)
    console.log(`🏷️  Tags BO: ${boTagsBefore.length}`)
    console.log('')

    if (!boTagsBefore.includes(TAG_TO_REMOVE)) {
      console.log(`⚠️  Tag "${TAG_TO_REMOVE}" não encontrada no AC`)
      console.log('Tags BO encontradas:')
      boTagsBefore.forEach((tag, i) => {
        console.log(`   ${i + 1}. ${tag}`)
      })
      return
    }

    console.log(`✅ Tag "${TAG_TO_REMOVE}" encontrada no AC`)
    console.log('')

    // REMOVER
    console.log('════════════════════════════════════════════════════════════════')
    console.log('🗑️  REMOVENDO TAG (COM LOGS DETALHADOS)')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    console.log(`🗑️  Chamando removeTag("${RUI_EMAIL}", "${TAG_TO_REMOVE}")`)
    console.log('')

    const removed = await activeCampaignService.removeTag(RUI_EMAIL, TAG_TO_REMOVE)

    console.log('')
    console.log(`🔍 Resultado: ${removed ? '✅ TRUE (removida)' : '❌ FALSE (falhou)'}`)
    console.log('')

    // Ver tags DEPOIS
    console.log('════════════════════════════════════════════════════════════════')
    console.log('📊 TAGS DEPOIS DA REMOÇÃO')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    console.log('⏱️  Aguardando 5 segundos para AC processar...')
    await new Promise(resolve => setTimeout(resolve, 5000))

    const tagsAfter = await activeCampaignService.getContactTagsByEmail(RUI_EMAIL)
    const boTagsAfter = tagsAfter.filter(tag => /^[A-Z_0-9]+ - .+$/.test(tag))

    console.log(`📊 Total tags: ${tagsAfter.length}`)
    console.log(`🏷️  Tags BO: ${boTagsAfter.length}`)
    console.log('')

    if (boTagsAfter.includes(TAG_TO_REMOVE)) {
      console.log(`❌ Tag "${TAG_TO_REMOVE}" AINDA ESTÁ NO AC!`)
      console.log('')
      console.log('💡 Possíveis causas:')
      console.log('   1. Cache do AC (pode demorar vários minutos)')
      console.log('   2. DELETE não funcionou')
      console.log('   3. Tag foi reaplicada por automação do AC')
    } else {
      console.log(`✅ Tag "${TAG_TO_REMOVE}" FOI REMOVIDA DO AC!`)
    }

    console.log('')

    // Comparação
    console.log('════════════════════════════════════════════════════════════════')
    console.log('📊 COMPARAÇÃO')
    console.log('════════════════════════════════════════════════════════════════')
    console.log(`Tags BO antes: ${boTagsBefore.length}`)
    console.log(`Tags BO depois: ${boTagsAfter.length}`)
    console.log(`Diferença: ${boTagsBefore.length - boTagsAfter.length}`)
    console.log('')

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
debugRemoveSingleTag()
  .then(() => {
    console.log('')
    console.log('✅ Script finalizado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error.message)
    process.exit(1)
  })
