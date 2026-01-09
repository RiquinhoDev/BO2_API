/**
 * 🐛 DEBUG: Ver RAW contactTags endpoint
 *
 * Verificar o que o AC realmente retorna
 */

import dotenv from 'dotenv'
dotenv.config()

import axios from 'axios'

const AC_URL = process.env.ACTIVE_CAMPAIGN_URL || 'https://serriquinho71518.api-us1.com'
const AC_KEY = process.env.ACTIVE_CAMPAIGN_KEY || '***REMOVED-SECRET***'
const RUI_CONTACT_ID = '21561'

async function debugRawContactTags() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('🐛 DEBUG: RAW ContactTags Endpoint')
  console.log('════════════════════════════════════════════════════════════════')
  console.log('')

  if (!AC_URL || !AC_KEY) {
    console.error('❌ ACTIVE_CAMPAIGN_URL ou ACTIVE_CAMPAIGN_KEY não configurados')
    process.exit(1)
  }

  const client = axios.create({
    baseURL: AC_URL,
    headers: {
      'Api-Token': AC_KEY
    }
  })

  try {
    console.log(`📡 GET /api/3/contacts/${RUI_CONTACT_ID}/contactTags`)
    console.log('')

    const response = await client.get(`/api/3/contacts/${RUI_CONTACT_ID}/contactTags`)

    const contactTags = response.data.contactTags || []

    console.log(`📊 Total contactTags: ${contactTags.length}`)
    console.log('')

    // Mostrar primeiras 10
    console.log('📋 Primeiras 10 contactTags (RAW):')
    console.log('')

    for (let i = 0; i < Math.min(10, contactTags.length); i++) {
      const ct = contactTags[i]
      console.log(`${i + 1}. contactTag ID: ${ct.id}`)
      console.log(`   contact: ${ct.contact}`)
      console.log(`   tag: ${ct.tag}`)
      console.log(`   cdate: ${ct.cdate}`)
      console.log('')
    }

    // Buscar detalhes das tags BO
    console.log('════════════════════════════════════════════════════════════════')
    console.log('🏷️  BUSCAR NOMES DAS TAGS BO')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    const tagIds = contactTags.map((ct: any) => ct.tag)
    const uniqueTagIds = [...new Set(tagIds)]

    console.log(`📊 Total tag IDs únicos: ${uniqueTagIds.length}`)
    console.log('')

    // Buscar nomes de algumas tags
    console.log('📋 Buscando nomes das primeiras 10 tags...')
    console.log('')

    for (let i = 0; i < Math.min(10, uniqueTagIds.length); i++) {
      const tagId = uniqueTagIds[i]

      try {
        const tagResponse = await client.get(`/api/3/tags/${tagId}`)
        const tagName = tagResponse.data.tag?.tag || 'N/A'

        const isBO = /^[A-Z_0-9]+ - .+$/.test(tagName)

        console.log(`${i + 1}. Tag ID ${tagId}: "${tagName}" ${isBO ? '🏷️ (BO)' : ''}`)
      } catch (error: any) {
        console.log(`${i + 1}. Tag ID ${tagId}: ❌ Erro ao buscar`)
      }
    }

    console.log('')

    // Procurar pela tag específica que tentámos remover
    console.log('════════════════════════════════════════════════════════════════')
    console.log('🔍 PROCURAR TAG "OGI_V1 - Inativo 10d"')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    let found = false

    for (const ct of contactTags) {
      try {
        const tagResponse = await client.get(`/api/3/tags/${ct.tag}`)
        const tagName = tagResponse.data.tag?.tag || ''

        if (tagName === 'OGI_V1 - Inativo 10d') {
          console.log('✅ Tag encontrada!')
          console.log(`   contactTag ID: ${ct.id}`)
          console.log(`   tag ID: ${ct.tag}`)
          console.log(`   contact ID: ${ct.contact}`)
          console.log(`   nome: ${tagName}`)
          console.log('')
          found = true
          break
        }
      } catch (error) {
        // Ignorar erros
      }
    }

    if (!found) {
      console.log('❌ Tag "OGI_V1 - Inativo 10d" NÃO encontrada!')
      console.log('✅ Isto significa que FOI removida do endpoint!')
    }

    console.log('')

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
debugRawContactTags()
  .then(() => {
    console.log('✅ Script finalizado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error.message)
    process.exit(1)
  })
