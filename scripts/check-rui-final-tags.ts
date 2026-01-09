// ════════════════════════════════════════════════════════════
// 📁 scripts/check-rui-final-tags.ts
// Verificar estado final das tags do Rui
// ════════════════════════════════════════════════════════════

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'
import { User } from '../src/models'
import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'

const RUI_EMAIL = 'ruifilipespteixeira@gmail.com'

async function checkRuiFinalTags() {
  console.log('════════════════════════════════════════════════════════════')
  console.log('🔍 VERIFICAÇÃO FINAL: Tags do Rui')
  console.log('════════════════════════════════════════════════════════════')
  console.log('')

  try {
    // Conectar BD
    const mongoUri = process.env.MONGO_URI || ''
    await mongoose.connect(mongoUri)

    // Buscar Rui
    const user = await User.findOne({ email: RUI_EMAIL }).lean()
    if (!user) throw new Error(`User ${RUI_EMAIL} não encontrado`)

    console.log('[BD] ✅ Rui encontrado')
    console.log(`   🆔 userId: ${user._id}`)
    console.log('')

    // Buscar contactId
    const contactId = await activeCampaignService.getContactId(user.email, user._id.toString())
    console.log('[AC] ✅ ContactId encontrado')
    console.log(`   🆔 contactId: ${contactId}`)
    console.log('')

    // Buscar TODAS as tags (bypass cache com timestamp)
    console.log('[AC] Buscando tags atuais (aguardando cache atualizar)...')
    console.log('')

    const service = activeCampaignService as any
    const client = service.client

    // Fazer request direto com no-cache
    const response = await client.get(`/api/3/contacts/${contactId}/contactTags`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })

    const contactTags = response.data.contactTags || []

    console.log(`[AC] ✅ ${contactTags.length} contactTags encontrados`)
    console.log('')

    // Buscar detalhes de cada tag
    const tagsWithDetails = []
    for (const ct of contactTags) {
      const tagResponse = await client.get(`/api/3/tags/${ct.tag}`)
      const tagName = tagResponse.data.tag?.tag || ct.tag
      tagsWithDetails.push({
        id: ct.id,
        tagId: ct.tag,
        name: tagName,
        createdAt: ct.cdate
      })
    }

    // Filtrar por tipo
    const ogiTags = tagsWithDetails.filter(t => t.name.toUpperCase().startsWith('OGI'))
    const clarezaTags = tagsWithDetails.filter(t => t.name.toUpperCase().startsWith('CLAREZA'))
    const otherTags = tagsWithDetails.filter(t =>
      !t.name.toUpperCase().startsWith('OGI') &&
      !t.name.toUpperCase().startsWith('CLAREZA')
    )

    // Mostrar resultado
    console.log('═══════════════════════════════════════════════════════════')
    console.log('📊 TAGS ATUAIS DO RUI')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('')

    console.log(`Total de tags: ${tagsWithDetails.length}`)
    console.log(`   OGI_V1: ${ogiTags.length}`)
    console.log(`   CLAREZA: ${clarezaTags.length}`)
    console.log(`   Outras: ${otherTags.length}`)
    console.log('')

    console.log('─'.repeat(60))
    console.log('🔵 TAGS OGI_V1:')
    console.log('─'.repeat(60))
    if (ogiTags.length > 0) {
      ogiTags.forEach((tag, idx) => {
        console.log(`   ${idx + 1}. ${tag.name}`)
        console.log(`      tagId: ${tag.tagId} | contactTagId: ${tag.id}`)
      })
    } else {
      console.log('   (nenhuma)')
    }
    console.log('')

    console.log('─'.repeat(60))
    console.log('🟣 TAGS CLAREZA:')
    console.log('─'.repeat(60))
    if (clarezaTags.length > 0) {
      clarezaTags.forEach((tag, idx) => {
        console.log(`   ${idx + 1}. ${tag.name}`)
        console.log(`      tagId: ${tag.tagId} | contactTagId: ${tag.id}`)
      })
    } else {
      console.log('   (nenhuma)')
    }
    console.log('')

    // Análise
    console.log('═══════════════════════════════════════════════════════════')
    console.log('✅ ANÁLISE')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('')

    // Tags esperadas
    const expectedOgiTags = ['OGI_V1 - Inativo 10d']
    const expectedClarezaTags = ['CLAREZA - Super Utilizador', 'CLAREZA - Ativo']

    // OGI_V1
    console.log('OGI_V1:')
    console.log(`   Esperado: ${expectedOgiTags.length} tag → [${expectedOgiTags.join(', ')}]`)
    console.log(`   Atual: ${ogiTags.length} tags → [${ogiTags.map(t => t.name).join(', ')}]`)

    const ogiCorrect = ogiTags.length === expectedOgiTags.length &&
                       ogiTags.every(t => expectedOgiTags.includes(t.name))

    if (ogiCorrect) {
      console.log(`   ✅ CORRETO - Tags coincidem!`)
    } else {
      console.log(`   ⚠️  DIFERENÇA - ${ogiTags.length - expectedOgiTags.length} tags a mais/menos`)

      const missing = expectedOgiTags.filter(t => !ogiTags.find(tag => tag.name === t))
      const extra = ogiTags.filter(t => !expectedOgiTags.includes(t.name))

      if (missing.length > 0) {
        console.log(`   ❌ Em falta: [${missing.join(', ')}]`)
      }
      if (extra.length > 0) {
        console.log(`   ⚠️  A mais (órfãs): [${extra.map(t => t.name).join(', ')}]`)
      }
    }
    console.log('')

    // CLAREZA
    console.log('CLAREZA:')
    console.log(`   Esperado: ${expectedClarezaTags.length} tags → [${expectedClarezaTags.join(', ')}]`)
    console.log(`   Atual: ${clarezaTags.length} tags → [${clarezaTags.map(t => t.name).join(', ')}]`)

    const clarezaCorrect = clarezaTags.length === expectedClarezaTags.length &&
                           clarezaTags.every(t => expectedClarezaTags.includes(t.name))

    if (clarezaCorrect) {
      console.log(`   ✅ CORRETO - Tags coincidem!`)
    } else {
      console.log(`   ⚠️  DIFERENÇA - ${clarezaTags.length - expectedClarezaTags.length} tags a mais/menos`)

      const missing = expectedClarezaTags.filter(t => !clarezaTags.find(tag => tag.name === t))
      const extra = clarezaTags.filter(t => !expectedClarezaTags.includes(t.name))

      if (missing.length > 0) {
        console.log(`   ❌ Em falta: [${missing.join(', ')}]`)
      }
      if (extra.length > 0) {
        console.log(`   ⚠️  A mais (órfãs): [${extra.map(t => t.name).join(', ')}]`)
      }
    }
    console.log('')

    // Conclusão
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🎯 CONCLUSÃO')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('')

    if (ogiCorrect && clarezaCorrect) {
      console.log('✅ SUCESSO TOTAL!')
      console.log('   Todas as tags estão corretas')
      console.log('   TagOrchestrator funcionou a 100%')
    } else {
      console.log('⚠️  PARCIALMENTE CORRETO')
      if (!ogiCorrect) {
        console.log(`   OGI_V1: ${ogiTags.length - expectedOgiTags.length > 0 ? 'Tags órfãs ainda presentes' : 'Tags em falta'}`)
      }
      if (!clarezaCorrect) {
        console.log(`   CLAREZA: ${clarezaTags.length - expectedClarezaTags.length > 0 ? 'Tags órfãs ainda presentes' : 'Tags em falta'}`)
      }
      console.log('')
      console.log('   Possíveis causas:')
      console.log('   - Cache do Active Campaign (demora minutos a atualizar)')
      console.log('   - Tags foram removidas mas ainda aparecem na listagem')
      console.log('   - Verificar com GET direto a cada contactTag (404 = removida)')
    }

    console.log('')
    console.log('✅ VERIFICAÇÃO COMPLETA')

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
  }
}

checkRuiFinalTags()
