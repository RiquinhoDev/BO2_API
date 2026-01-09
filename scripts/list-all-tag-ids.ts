// ════════════════════════════════════════════════════════════
// 📁 scripts/list-all-tag-ids.ts
// Listar TODOS os IDs das tags OGI_V1 do Rui
// ════════════════════════════════════════════════════════════

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'
import { User } from '../src/models'
import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'

const RUI_EMAIL = 'ruifilipespteixeira@gmail.com'

async function listAllTagIds() {
  console.log('════════════════════════════════════════════════════════════')
  console.log('🔍 LISTAGEM COMPLETA: IDs das Tags OGI_V1 do Rui')
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
    console.log(`   🆔 ID na BD (userId): ${user._id}`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 3. BUSCAR CONTACTID NA AC
    // ═══════════════════════════════════════════════════════════

    console.log('[AC] Buscando contactId na AC...')
    const contactId = await activeCampaignService.getContactId(user.email, user._id.toString())

    if (!contactId) throw new Error(`Rui não tem contacto na AC`)

    console.log('[AC] ✅ ContactId encontrado')
    console.log(`   🆔 ID na AC (contactId): ${contactId}`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 4. BUSCAR TODAS AS TAGS DO RUI (usando activeCampaignService)
    // ═══════════════════════════════════════════════════════════

    console.log('[AC] Buscando contactTags via activeCampaignService...')

    // Usar método privado (via reflection) para acessar client
    const service = activeCampaignService as any
    const client = service.client

    // Buscar contactTags (associações) - raw response
    const response = await client.get(`/api/3/contacts/${contactId}/contactTags`)
    const contactTags = response.data.contactTags || []

    console.log(`[AC] ✅ ${contactTags.length} contactTags encontrados\n`)

    // ═══════════════════════════════════════════════════════════
    // 5. PARA CADA CONTACTTAG, BUSCAR DETALHES DA TAG
    // ═══════════════════════════════════════════════════════════

    console.log('[AC] Buscando detalhes de cada tag...')
    console.log('')

    interface TagInfo {
      contactTagId: string
      tagId: string
      tagName: string
      createdAt: string
    }

    const tagsInfo: TagInfo[] = []

    for (const ct of contactTags) {
      // Buscar detalhes da tag
      const tagResponse = await client.get(`/api/3/tags/${ct.tag}`)
      const tagName = tagResponse.data.tag?.tag || 'Unknown'

      tagsInfo.push({
        contactTagId: ct.id,
        tagId: ct.tag,
        tagName: tagName,
        createdAt: ct.cdate
      })
    }

    // Filtrar apenas tags OGI_V1
    const ogiTags = tagsInfo.filter(t => t.tagName.toUpperCase().startsWith('OGI_V1'))

    console.log(`[AC] ✅ ${ogiTags.length} tags OGI_V1 encontradas\n`)

    // ═══════════════════════════════════════════════════════════
    // 6. EXIBIR TABELA
    // ═══════════════════════════════════════════════════════════

    console.log('══════════════════════════════════════════════════════════════════════════════════════')
    console.log('📋 TAGS OGI_V1 DO RUI - IDs COMPLETOS')
    console.log('══════════════════════════════════════════════════════════════════════════════════════')
    console.log('')
    console.log('🆔 Active Campaign ID do Rui (contactId): ' + contactId)
    console.log('')
    console.log('─'.repeat(90))
    console.log('# | TAG NAME                      | TAG ID | CONTACTTAG ID | CRIADA EM')
    console.log('─'.repeat(90))

    ogiTags.forEach((tag, idx) => {
      const num = String(idx + 1).padStart(2, ' ')
      const name = tag.tagName.padEnd(30, ' ')
      const tagId = tag.tagId.padEnd(7, ' ')
      const ctId = tag.contactTagId.padEnd(14, ' ')
      const date = new Date(tag.createdAt).toISOString().split('T')[0]

      console.log(`${num} | ${name} | ${tagId} | ${ctId} | ${date}`)
    })

    console.log('─'.repeat(90))
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 7. RESUMO EM JSON (para copiar)
    // ═══════════════════════════════════════════════════════════

    console.log('══════════════════════════════════════════════════════════════════════════════════════')
    console.log('📄 RESUMO EM JSON')
    console.log('══════════════════════════════════════════════════════════════════════════════════════')
    console.log('')

    const summary = {
      ruiUserId: user._id.toString(),
      ruiContactId: contactId,
      totalOgiTags: ogiTags.length,
      tags: ogiTags.map(t => ({
        name: t.tagName,
        tagId: t.tagId,
        contactTagId: t.contactTagId,
        deleteEndpoint: `/api/3/contactTags/${t.contactTagId}`
      }))
    }

    console.log(JSON.stringify(summary, null, 2))
    console.log('')

    console.log('✅ LISTAGEM COMPLETA')

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

listAllTagIds()
