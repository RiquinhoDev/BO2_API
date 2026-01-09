/**
 * 📋 LISTA COMPLETA: Todas as Tags do Rui (AC + BD)
 *
 * Mostra:
 * 1. Tags na AC (com todos os detalhes do contactTag + nome da tag)
 * 2. Tags na BD (do UserProduct.activeCampaignData.tags)
 */

import dotenv from 'dotenv'
dotenv.config()

import axios from 'axios'
import mongoose from 'mongoose'
import '../src/models'
import { User } from '../src/models'
import UserProduct from '../src/models/UserProduct'

const AC_URL = process.env.ACTIVE_CAMPAIGN_URL || 'https://serriquinho71518.api-us1.com'
const AC_KEY = process.env.ACTIVE_CAMPAIGN_KEY || '001fca1fbd99ae7cddc45db8a0fafa83875697938e53eb9a95be40c083f1a6892098b6a7'
const RUI_EMAIL = 'ruifilipespteixeira@gmail.com'
const RUI_CONTACT_ID = '21561'

interface ContactTagWithName {
  contactTag: any
  tagName: string
  tagId: string
}

async function listRuiTagsComplete() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('📋 LISTA COMPLETA: Tags do Rui (AC + BD)')
  console.log('════════════════════════════════════════════════════════════════')
  console.log('')

  const client = axios.create({
    baseURL: AC_URL,
    headers: {
      'Api-Token': AC_KEY
    }
  })

  try {
    // Conectar BD
    console.log('📡 Conectando à BD...')
    const mongoUri = process.env.MONGO_URI || ''
    if (!mongoUri) throw new Error('MONGO_URI não configurado')

    await mongoose.connect(mongoUri)
    console.log('✅ Conectado à BD')
    console.log('')

    // ═══════════════════════════════════════════════════════════
    // PARTE 1: TAGS NA ACTIVE CAMPAIGN
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('📊 PARTE 1: TAGS NA ACTIVE CAMPAIGN')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    console.log(`📡 Buscando contactTags do Rui (contact ID: ${RUI_CONTACT_ID})...`)
    const response = await client.get(`/api/3/contacts/${RUI_CONTACT_ID}/contactTags`)
    const contactTags = response.data.contactTags || []

    console.log(`📊 Total contactTags: ${contactTags.length}`)
    console.log('')

    // Buscar nomes das tags
    const tagsWithNames: ContactTagWithName[] = []

    for (const ct of contactTags) {
      let tagName = `Tag ID ${ct.tag}`

      try {
        const tagResponse = await client.get(`/api/3/tags/${ct.tag}`)
        tagName = tagResponse.data.tag?.tag || tagName
      } catch (error) {
        // Se falhar, manter ID
      }

      tagsWithNames.push({
        contactTag: ct,
        tagName,
        tagId: ct.tag
      })
    }

    // Separar tags BO das outras
    const boTags = tagsWithNames.filter(t => /^[A-Z_0-9]+ - .+$/.test(t.tagName))
    const otherTags = tagsWithNames.filter(t => !/^[A-Z_0-9]+ - .+$/.test(t.tagName))

    console.log('─────────────────────────────────────────────────────────────')
    console.log(`🏷️  TAGS BO (${boTags.length}):`)
    console.log('─────────────────────────────────────────────────────────────')
    console.log('')

    if (boTags.length === 0) {
      console.log('   (nenhuma)')
    } else {
      boTags.forEach((t, i) => {
        console.log(`${i + 1}. "${t.tagName}"`)
        console.log(`   contactTag ID: ${t.contactTag.id}`)
        console.log(`   tag ID: ${t.tagId}`)
        console.log(`   contact: ${t.contactTag.contact}`)
        console.log(`   cdate: ${t.contactTag.cdate}`)
        console.log(`   created_timestamp: ${t.contactTag.created_timestamp}`)
        console.log(`   updated_timestamp: ${t.contactTag.updated_timestamp}`)
        console.log(`   created_by: ${t.contactTag.created_by || 'null'}`)
        console.log(`   updated_by: ${t.contactTag.updated_by || 'null'}`)
        console.log(`   links:`)
        console.log(`     tag: ${t.contactTag.links?.tag || 'N/A'}`)
        console.log(`     contact: ${t.contactTag.links?.contact || 'N/A'}`)
        console.log('')
      })
    }

    console.log('─────────────────────────────────────────────────────────────')
    console.log(`📌 OUTRAS TAGS (${otherTags.length}):`)
    console.log('─────────────────────────────────────────────────────────────')
    console.log('')

    if (otherTags.length === 0) {
      console.log('   (nenhuma)')
    } else {
      otherTags.forEach((t, i) => {
        console.log(`${i + 1}. "${t.tagName}"`)
        console.log(`   contactTag ID: ${t.contactTag.id}`)
        console.log(`   tag ID: ${t.tagId}`)
        console.log(`   cdate: ${t.contactTag.cdate}`)
        console.log('')
      })
    }

    // ═══════════════════════════════════════════════════════════
    // PARTE 2: TAGS NA BD
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('💾 PARTE 2: TAGS NA BD (UserProduct)')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    // Buscar user
    const user = await User.findOne({ email: RUI_EMAIL })

    if (!user) {
      console.log('❌ User não encontrado na BD')
    } else {
      console.log(`✅ User encontrado: ${user.name}`)
      console.log(`   ID: ${user._id}`)
      console.log('')

      // Buscar UserProducts
      const userProducts = await UserProduct.find({
        userId: user._id
      }).populate('productId')

      console.log(`📦 Total UserProducts: ${userProducts.length}`)
      console.log('')

      let totalBDTags = 0

      for (const up of userProducts) {
        const product = up.productId as any
        const tags = up.activeCampaignData?.tags || []

        console.log('─────────────────────────────────────────────────────────────')
        console.log(`📦 Produto: ${product.name} (${product.code})`)
        console.log(`   UserProduct ID: ${up._id}`)
        console.log(`   Status: ${up.status}`)
        console.log(`   Tags BD: ${tags.length}`)
        console.log('')

        if (tags.length === 0) {
          console.log('   (sem tags)')
        } else {
          tags.forEach((tag: string, i: number) => {
            console.log(`   ${i + 1}. "${tag}"`)
            totalBDTags++
          })
        }
        console.log('')
      }

      console.log('─────────────────────────────────────────────────────────────')
      console.log(`📊 Total tags na BD: ${totalBDTags}`)
      console.log('─────────────────────────────────────────────────────────────')
      console.log('')
    }

    // ═══════════════════════════════════════════════════════════
    // COMPARAÇÃO
    // ═══════════════════════════════════════════════════════════

    console.log('════════════════════════════════════════════════════════════════')
    console.log('📊 COMPARAÇÃO AC vs BD')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('')

    console.log(`📊 Tags BO na AC: ${boTags.length}`)
    console.log(`📊 Outras tags na AC: ${otherTags.length}`)
    console.log(`📊 Total tags na AC: ${tagsWithNames.length}`)
    console.log('')

    if (user) {
      const userProducts = await UserProduct.find({ userId: user._id })
      const allBDTags = userProducts.flatMap(up => up.activeCampaignData?.tags || [])

      console.log(`💾 Tags na BD: ${allBDTags.length}`)
      console.log('')

      // Encontrar discrepâncias
      const boTagNames = boTags.map(t => t.tagName)
      const bdTagNames = [...new Set(allBDTags)]

      const onlyInAC = boTagNames.filter(t => !bdTagNames.includes(t))
      const onlyInBD = bdTagNames.filter(t => !boTagNames.includes(t))

      if (onlyInAC.length > 0) {
        console.log('⚠️  Tags APENAS na AC (não na BD):')
        onlyInAC.forEach(t => console.log(`   - ${t}`))
        console.log('')
      }

      if (onlyInBD.length > 0) {
        console.log('⚠️  Tags APENAS na BD (não na AC):')
        onlyInBD.forEach(t => console.log(`   - ${t}`))
        console.log('')
      }

      if (onlyInAC.length === 0 && onlyInBD.length === 0) {
        console.log('✅ AC e BD estão sincronizados (tags BO)')
      }
    }

    console.log('════════════════════════════════════════════════════════════════')

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    if (error.response) {
      console.error('Status:', error.response.status)
      console.error('Data:', JSON.stringify(error.response.data, null, 2))
    }
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('🔌 Conexão BD fechada')
  }
}

// Executar
listRuiTagsComplete()
  .then(() => {
    console.log('')
    console.log('✅ Script finalizado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error.message)
    process.exit(1)
  })
