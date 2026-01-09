/**
 * 🐛 DEBUG: Encontrar TODOS os contactTags de uma tag específica
 *
 * Verificar se há múltiplos contactTags para a mesma tag
 */

import dotenv from 'dotenv'
dotenv.config()

import axios from 'axios'

const AC_URL = process.env.ACTIVE_CAMPAIGN_URL || 'https://serriquinho71518.api-us1.com'
const AC_KEY = process.env.ACTIVE_CAMPAIGN_KEY || '001fca1fbd99ae7cddc45db8a0fafa83875697938e53eb9a95be40c083f1a6892098b6a7'
const RUI_CONTACT_ID = '21561'
const TAG_NAME = 'OGI_V1 - Inativo 10d'

async function debugFindAllContactTags() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('🐛 DEBUG: Encontrar TODOS os ContactTags')
  console.log('════════════════════════════════════════════════════════════════')
  console.log('')

  const client = axios.create({
    baseURL: AC_URL,
    headers: {
      'Api-Token': AC_KEY
    }
  })

  try {
    // 1. Buscar tag ID
    console.log(`🔍 Buscando tag "${TAG_NAME}"...`)
    const tagsResponse = await client.get('/api/3/tags', {
      params: { search: TAG_NAME }
    })

    const tags = tagsResponse.data.tags || []
    const tag = tags.find((t: any) => t.tag === TAG_NAME)
 console.log(`❌ Tag "${tag.tag}" não encontrada no AC`)
    if (!tag) {
      console.log(`❌ Tag "${TAG_NAME}" não encontrada no AC`)
      return
    }

    const tagId = tag.id
    console.log(`✅ Tag encontrada (ID: ${tagId})`)
    console.log('')

    // 2. Buscar TODOS os contactTags para esta tag
    console.log(`🔍 Buscando TODOS os contactTags para tag ID ${tagId}...`)
    const contactTagsResponse = await client.get('/api/3/contactTags', {
      params: {
        'filters[tag]': tagId
      }
    })

    const allContactTags = contactTagsResponse.data.contactTags || []

    console.log(`📊 Total contactTags para esta tag: ${allContactTags.length}`)
    console.log('')

    if (allContactTags.length === 0) {
      console.log('✅ Nenhum contactTag encontrado - tag não está aplicada a ninguém')
      return
    }

    // 3. Mostrar TODOS
    console.log('📋 Todos os contactTags:')
    console.log('')

    for (let i = 0; i < allContactTags.length; i++) {
      const ct = allContactTags[i]
      console.log(`${i + 1}. contactTag ID: ${ct.id}`)
      console.log(`   contact: ${ct.contact}`)
      console.log(`   tag: ${ct.tag}`)
      console.log(`   cdate: ${ct.cdate}`)
      console.log(`   isRui: ${ct.contact === RUI_CONTACT_ID ? '✅ SIM' : '❌ NÃO'}`)
      console.log('')
    }

    // 4. Filtrar apenas do Rui
    const ruiContactTags = allContactTags.filter((ct: any) => ct.contact === RUI_CONTACT_ID)

    console.log('════════════════════════════════════════════════════════════════')
    console.log('🎯 CONTACTTAGS DO RUI')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')
    console.log(`📊 Total: ${ruiContactTags.length}`)
    console.log('')

    if (ruiContactTags.length === 0) {
      console.log('✅ Rui NÃO tem esta tag aplicada')
    } else if (ruiContactTags.length === 1) {
      console.log('✅ Rui tem 1 contactTag (normal)')
      console.log(`   ID: ${ruiContactTags[0].id}`)
    } else {
      console.log('⚠️  ATENÇÃO: Rui tem MÚLTIPLOS contactTags para a mesma tag!')
      console.log('')
      ruiContactTags.forEach((ct: any, i: number) => {
        console.log(`   ${i + 1}. contactTag ID: ${ct.id} (criado: ${ct.cdate})`)
      })
      console.log('')
      console.log('💡 Isto pode causar problemas - precisamos apagar TODOS!')
    }

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    if (error.response) {
      console.error('Status:', error.response.status)
      console.error('Data:', JSON.stringify(error.response.data, null, 2))
    }
    process.exit(1)
  }
}

// Executar
debugFindAllContactTags()
  .then(() => {
    console.log('')
    console.log('✅ Script finalizado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error.message)
    process.exit(1)
  })
