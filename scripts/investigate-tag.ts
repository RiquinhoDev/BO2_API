// ════════════════════════════════════════════════════════════
// 📁 scripts/investigate-tag.ts
// Investigar tag específica: IDs em BD e AC
// ════════════════════════════════════════════════════════════

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'
import { User } from '../src/models'
import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'

const RUI_EMAIL = 'ruifilipespteixeira@gmail.com'
const TAG_NAME = 'OGI_V1 - Progresso Médio'

async function investigateTag() {
  console.log('════════════════════════════════════════════════════════════')
  console.log(`🔍 INVESTIGAÇÃO: "${TAG_NAME}"`)
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
    // 2. BUSCAR RUI NA BD
    // ═══════════════════════════════════════════════════════════

    console.log(`[BD] Buscando Rui (${RUI_EMAIL}) na BD...`)
    const user = await User.findOne({ email: RUI_EMAIL }).lean()

    if (!user) {
      throw new Error(`User ${RUI_EMAIL} não encontrado`)
    }

    console.log('[BD] ✅ Rui encontrado')
    console.log(`   📌 ID do Rui na BD: ${user._id}`)
    console.log(`   📧 Email: ${user.email}`)
    console.log(`   👤 Nome: ${user.name}`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 3. BUSCAR CONTACTID DO RUI NA AC
    // ═══════════════════════════════════════════════════════════

    console.log('[AC] Buscando contactId do Rui na AC...')
    const contactId = await activeCampaignService.getContactId(user.email, user._id.toString())

    if (!contactId) {
      throw new Error(`Rui não tem contacto na AC`)
    }

    console.log('[AC] ✅ ContactId do Rui encontrado')
    console.log(`   📌 ID do Rui na AC (contactId): ${contactId}`)
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 4. BUSCAR TAG NA AC (por nome)
    // ═══════════════════════════════════════════════════════════

    console.log(`[AC] Buscando tag "${TAG_NAME}" na AC...`)
    const tagId = await activeCampaignService.findTagByName(TAG_NAME)

    if (!tagId) {
      console.log(`[AC] ❌ Tag "${TAG_NAME}" NÃO EXISTE na AC`)
      console.log(`   ℹ️  A tag pode ter sido criada localmente mas não sincronizada`)
      console.log('')
    } else {
      console.log('[AC] ✅ Tag encontrada na AC')
      console.log(`   📌 ID da Tag na AC (tagId): ${tagId}`)
      console.log('')

      // ═══════════════════════════════════════════════════════════
      // 5. BUSCAR ASSOCIAÇÃO TAG <-> CONTACTO (contactTag)
      // ═══════════════════════════════════════════════════════════

      console.log(`[AC] Verificando se tag está associada ao Rui...`)
      const contactTagId = await activeCampaignService['findContactTag'](contactId, tagId)

      if (!contactTagId) {
        console.log(`[AC] ❌ Tag NÃO está associada ao Rui`)
        console.log(`   ℹ️  A tag existe na AC mas não está aplicada neste contacto`)
        console.log('')
      } else {
        console.log('[AC] ✅ Tag ESTÁ associada ao Rui')
        console.log(`   📌 ID da Associação (contactTagId): ${contactTagId}`)
        console.log('')
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 6. BUSCAR TODAS AS TAGS DO RUI (verificar se aparece)
    // ═══════════════════════════════════════════════════════════

    console.log('[AC] Buscando TODAS as tags do Rui...')
    const allTags = await activeCampaignService.getContactTagsByEmail(user.email)

    console.log(`[AC] ✅ Total de tags do Rui: ${allTags.length}`)

    const hasTag = allTags.includes(TAG_NAME)
    if (hasTag) {
      console.log(`   ✅ Tag "${TAG_NAME}" APARECE na lista`)
    } else {
      console.log(`   ❌ Tag "${TAG_NAME}" NÃO APARECE na lista`)
    }
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 7. LISTAR TAGS OGI_V1 DO RUI
    // ═══════════════════════════════════════════════════════════

    console.log('══════════════════════════════════════════════════════════════')
    console.log('📋 TAGS OGI_V1 DO RUI (lista completa)')
    console.log('══════════════════════════════════════════════════════════════')
    console.log('')

    const ogiTags = allTags.filter((tag: string) => tag.toUpperCase().startsWith('OGI'))

    console.log(`Total de tags OGI_V1: ${ogiTags.length}`)
    ogiTags.forEach((tag: string, idx: number) => {
      const marker = tag === TAG_NAME ? ' ← ESTA!' : ''
      console.log(`   ${idx + 1}. ${tag}${marker}`)
    })
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // 8. RESUMO
    // ═══════════════════════════════════════════════════════════

    console.log('══════════════════════════════════════════════════════════════')
    console.log('📊 RESUMO DA INVESTIGAÇÃO')
    console.log('══════════════════════════════════════════════════════════════')
    console.log('')
    console.log(`Tag investigada: "${TAG_NAME}"`)
    console.log('')
    console.log('IDs Encontrados:')
    console.log(`   🆔 Rui (BD):           ${user._id}`)
    console.log(`   🆔 Rui (AC):           ${contactId}`)
    console.log(`   🆔 Tag (AC):           ${tagId || 'N/A (não existe)'}`)
    console.log(`   🆔 Associação (AC):    ${tagId ? (await activeCampaignService['findContactTag'](contactId, tagId) || 'N/A (não associada)') : 'N/A'}`)
    console.log('')
    console.log('Status:')
    console.log(`   Tag existe na AC?      ${tagId ? '✅ SIM' : '❌ NÃO'}`)
    console.log(`   Tag está no Rui?       ${tagId && await activeCampaignService['findContactTag'](contactId, tagId) ? '✅ SIM' : '❌ NÃO'}`)
    console.log(`   Tag aparece na lista?  ${hasTag ? '✅ SIM' : '❌ NÃO'}`)
    console.log('')

    console.log('✅ INVESTIGAÇÃO COMPLETA')

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

investigateTag()
