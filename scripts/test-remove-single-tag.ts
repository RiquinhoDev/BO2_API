// ════════════════════════════════════════════════════════════
// 📁 scripts/test-remove-single-tag.ts
// Testar remoção de UMA tag específica com logs detalhados
// ════════════════════════════════════════════════════════════

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'
import { User } from '../src/models'
import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'

const RUI_EMAIL = 'ruifilipespteixeira@gmail.com'
const TAG_TO_REMOVE = 'OGI_V1 - Inativo 21d' // contactTagId: 1564239

async function testRemoveSingleTag() {
  console.log('════════════════════════════════════════════════════════════')
  console.log(`🧪 TESTE: Remover tag "${TAG_TO_REMOVE}"`)
  console.log('════════════════════════════════════════════════════════════')
  console.log('')

  try {
    // ═══════════════════════════════════════════════════════════
    // 1. CONECTAR BD
    // ═══════════════════════════════════════════════════════════

    console.log('[SETUP] Conectando à BD...')
    const mongoUri = process.env.MONGO_URI || ''
    if (!mongoUri) throw new Error('MONGO_URI não configurado')

    await mongoose.connect(mongoUri)
    console.log('[SETUP] ✅ Conectado à BD\n')

    // ═══════════════════════════════════════════════════════════
    // 2. BUSCAR RUI
    // ═══════════════════════════════════════════════════════════

    console.log(`[BD] Buscando Rui (${RUI_EMAIL})...`)
    const user = await User.findOne({ email: RUI_EMAIL }).lean()

    if (!user) throw new Error(`User ${RUI_EMAIL} não encontrado`)

    console.log('[BD] ✅ Rui encontrado')
    console.log(`   🆔 userId: ${user._id}`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 3. VERIFICAR TAG ANTES
    // ═══════════════════════════════════════════════════════════

    console.log('[AC] Verificando tags ANTES da remoção...')
    const tagsBefore = await activeCampaignService.getContactTagsByEmail(user.email)
    const hasTagBefore = tagsBefore.includes(TAG_TO_REMOVE)

    console.log(`[AC] Total de tags: ${tagsBefore.length}`)
    console.log(`[AC] Tag "${TAG_TO_REMOVE}" presente? ${hasTagBefore ? '✅ SIM' : '❌ NÃO'}`)
    console.log('')

    if (!hasTagBefore) {
      console.log('⚠️  Tag já não está presente. Nada a fazer.')
      return
    }

    // ═══════════════════════════════════════════════════════════
    // 4. BUSCAR IDs DA TAG (contactTagId)
    // ═══════════════════════════════════════════════════════════

    console.log('[AC] Buscando IDs da tag...')

    const contactId = await activeCampaignService.getContactId(user.email, user._id.toString())
    const tagId = await activeCampaignService.findTagByName(TAG_TO_REMOVE)
    const contactTagId = await activeCampaignService['findContactTag'](contactId, tagId)

    console.log(`[AC] contactId: ${contactId}`)
    console.log(`[AC] tagId: ${tagId}`)
    console.log(`[AC] contactTagId: ${contactTagId}`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 5. TENTAR REMOVER (usando método do service)
    // ═══════════════════════════════════════════════════════════

    console.log('═══════════════════════════════════════════════════════════')
    console.log('🗑️  TENTANDO REMOVER VIA activeCampaignService.removeTag()')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('')

    const removed = await activeCampaignService.removeTag(user.email, TAG_TO_REMOVE)

    console.log('')
    console.log(`[RESULT] removeTag() retornou: ${removed ? '✅ TRUE (sucesso)' : '❌ FALSE (falhou)'}`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 6. VERIFICAR TAG DEPOIS
    // ═══════════════════════════════════════════════════════════

    console.log('[AC] Aguardando 5 segundos para AC processar...')
    await new Promise(resolve => setTimeout(resolve, 5000))

    console.log('[AC] Verificando tags DEPOIS da remoção...')
    const tagsAfter = await activeCampaignService.getContactTagsByEmail(user.email)
    const hasTagAfter = tagsAfter.includes(TAG_TO_REMOVE)

    console.log(`[AC] Total de tags: ${tagsAfter.length}`)
    console.log(`[AC] Tag "${TAG_TO_REMOVE}" presente? ${hasTagAfter ? '❌ SIM (FALHOU!)' : '✅ NÃO (REMOVIDA!)'}`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 7. VERIFICAR DIRETAMENTE NA API (bypass cache)
    // ═══════════════════════════════════════════════════════════

    console.log('[AC] Verificando diretamente na API (bypass cache)...')

    const service = activeCampaignService as any
    const client = service.client

    try {
      const response = await client.get(`/api/3/contactTags/${contactTagId}`)
      console.log(`[AC] ❌ contactTag ${contactTagId} AINDA EXISTE na AC!`)
      console.log(`[AC] Response:`, JSON.stringify(response.data, null, 2))
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log(`[AC] ✅ contactTag ${contactTagId} NÃO EXISTE (404) - FOI REMOVIDO!`)
      } else {
        console.log(`[AC] ⚠️  Erro ao verificar: ${error.message}`)
      }
    }
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 8. RESUMO
    // ═══════════════════════════════════════════════════════════

    console.log('═══════════════════════════════════════════════════════════')
    console.log('📊 RESUMO')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('')
    console.log(`Tag a remover: "${TAG_TO_REMOVE}"`)
    console.log(`contactTagId: ${contactTagId}`)
    console.log('')
    console.log('Status:')
    console.log(`   Antes da remoção:   ${hasTagBefore ? '✅ Presente' : '❌ Ausente'}`)
    console.log(`   removeTag() result: ${removed ? '✅ TRUE' : '❌ FALSE'}`)
    console.log(`   Depois da remoção:  ${hasTagAfter ? '❌ Ainda presente (FALHOU)' : '✅ Removida (SUCESSO)'}`)
    console.log('')

    if (hasTagBefore && !hasTagAfter) {
      console.log('✅ SUCESSO: Tag foi removida corretamente!')
    } else if (hasTagBefore && hasTagAfter) {
      console.log('❌ FALHA: Tag ainda está presente após tentativa de remoção')
      console.log('')
      console.log('Possíveis causas:')
      console.log('   1. Cache do Active Campaign (demora > 5s)')
      console.log('   2. API retorna 200 mas não executa o DELETE')
      console.log('   3. Webhook re-adiciona tag automaticamente')
      console.log('   4. Permissões da API key')
    } else {
      console.log('ℹ️  Tag já não estava presente antes da remoção')
    }

    console.log('')
    console.log('✅ TESTE COMPLETO')

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n[SETUP] Desconectado da BD')
  }
}

// ════════════════════════════════════════════════════════════
// EXECUTAR
// ════════════════════════════════════════════════════════════

testRemoveSingleTag()
