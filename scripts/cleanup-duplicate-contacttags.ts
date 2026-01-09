/**
 * 🧹 CLEANUP: Remover ContactTags Duplicados (TODOS OS USERS)
 *
 * Remove TODAS as associações duplicadas (mantém apenas a mais recente por tag).
 * Suporta DRY_RUN mode para simular antes de aplicar.
 *
 * Usage:
 *   npm run cleanup:duplicates           # DRY RUN (default)
 *   DRY_RUN=false npm run cleanup:duplicates  # APPLY
 */

import dotenv from 'dotenv'
dotenv.config()

import axios from 'axios'
import mongoose from 'mongoose'
import '../src/models'
import { User } from '../src/models'

const AC_URL = process.env.ACTIVE_CAMPAIGN_URL || 'https://serriquinho71518.api-us1.com'
const AC_KEY = process.env.ACTIVE_CAMPAIGN_KEY || '***REMOVED-SECRET***'


interface ContactTag {
  id: string
  contact: string
  tag: string
  cdate: string
  created_timestamp: string
}

async function cleanupDuplicateContactTags() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('🧹 CLEANUP: Remover ContactTags Duplicados')
  console.log('════════════════════════════════════════════════════════════════')
  console.log('')

  // Validar variáveis de ambiente
  if (!AC_URL || !AC_KEY) {
    throw new Error('ACTIVE_CAMPAIGN_URL e ACTIVE_CAMPAIGN_KEY devem estar configurados no .env')
  }

  const client = axios.create({
    baseURL: AC_URL,
    headers: {
      'Api-Token': AC_KEY,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  })

  const dryRun = process.env.DRY_RUN !== 'false'

  if (dryRun) {
    console.log('🔍 Modo: DRY RUN (simulação)')
  } else {
    console.log('⚠️  Modo: APPLY (removerá duplicates!)')
  }
  console.log('')

  try {
    // Conectar BD
    console.log('📡 Conectando à BD...')
    const mongoUri = process.env.MONGO_URI || ''
    if (!mongoUri) throw new Error('MONGO_URI não configurado')

    await mongoose.connect(mongoUri)
    console.log('✅ Conectado')
    console.log('')

    // Buscar todos os users
    console.log('🔍 Buscando users...')
    const users = await User.find().select('email name').lean()
    console.log(`✅ ${users.length} users`)
    console.log('')

    let totalContactsProcessed = 0
    let totalDuplicatesFound = 0
    let totalDuplicatesRemoved = 0
    let totalErrors = 0

    // Processar cada user
    for (let i = 0; i < users.length; i++) {
      const user = users[i] as any
      const progress = ((i + 1) / users.length * 100).toFixed(1)

      console.log(`[${i + 1}/${users.length}] ${user.email} (${progress}%)`)

      try {
        // Buscar contact
        const searchResponse = await client.get('/api/3/contacts', {
          params: { email: user.email }
        })

        const contacts = searchResponse.data.contacts || []
        if (contacts.length === 0) {
          console.log('   ⚠️  Não encontrado na AC')
          continue
        }

        const contactId = contacts[0].id
        totalContactsProcessed++

        // Buscar contactTags
        const tagsResponse = await client.get(`/api/3/contacts/${contactId}/contactTags`)
        const contactTags: ContactTag[] = tagsResponse.data.contactTags || []

        if (contactTags.length === 0) {
          console.log('   ℹ️  Sem tags')
          continue
        }

        // Agrupar por tagId
        const tagGroups = new Map<string, ContactTag[]>()

        for (const ct of contactTags) {
          const tagId = ct.tag
          if (!tagGroups.has(tagId)) {
            tagGroups.set(tagId, [])
          }
          tagGroups.get(tagId)!.push(ct)
        }

        // Encontrar duplicates
        const duplicates: { tagId: string; contactTags: ContactTag[] }[] = []

        for (const [tagId, tags] of tagGroups.entries()) {
          if (tags.length > 1) {
            duplicates.push({ tagId, contactTags: tags })
          }
        }

        if (duplicates.length === 0) {
          console.log(`   ✅ OK (${contactTags.length} tags)`)
          continue
        }

        console.log(`   ⚠️  ${duplicates.length} duplicates:`)
        totalDuplicatesFound += duplicates.length

        // Processar cada duplicate
        for (const dup of duplicates) {
          // Buscar nome da tag (apenas se não for DRY_RUN)
          let tagName = `Tag ${dup.tagId}`
          if (!dryRun || duplicates.length <= 3) {
            try {
              const tagResponse = await client.get(`/api/3/tags/${dup.tagId}`)
              tagName = tagResponse.data.tag?.tag || tagName
            } catch (err) {
              // Ignorar
            }
          }

          // Ordenar por data (MAIS RECENTE primeiro)
          const sorted = dup.contactTags.sort((a, b) => {
            return new Date(b.created_timestamp).getTime() - new Date(a.created_timestamp).getTime()
          })

          const toKeep = sorted[0]
          const toRemove = sorted.slice(1)

          console.log(`      "${tagName}": manter ${toKeep.id}, remover ${toRemove.length}`)

          // Remover duplicates
          for (const ct of toRemove) {
            if (!dryRun) {
              try {
                await client.delete(`/api/3/contactTags/${ct.id}`)
                totalDuplicatesRemoved++
                await new Promise(resolve => setTimeout(resolve, 250))
              } catch (err: any) {
                if (err.response?.status === 404) {
                  totalDuplicatesRemoved++
                } else {
                  totalErrors++
                }
              }
            }
          }
        }

      } catch (error: any) {
        console.log(`   ❌ Erro: ${error.message}`)
        totalErrors++
      }

      // Pausa entre users
      if (i < users.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300))
      }
    }

    // Resumo
    console.log('')
    console.log('════════════════════════════════════════════════════════════════')
    console.log('✅ LIMPEZA COMPLETA')
    console.log('════════════════════════════════════════════════════════════════')
    console.log(`📊 Contacts: ${totalContactsProcessed}`)
    console.log(`🔍 Duplicates: ${totalDuplicatesFound}`)

    if (dryRun) {
      console.log(``)
      console.log(`Para aplicar, execute:`)
      console.log(`DRY_RUN=false npm run cleanup:duplicates`)
    } else {
      console.log(`✅ Removidos: ${totalDuplicatesRemoved}`)
    }

    console.log(`❌ Erros: ${totalErrors}`)
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
  }
}

// Executar
cleanupDuplicateContactTags()
  .then(() => {
    console.log('')
    console.log('✅ Cleanup finalizado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error.message)
    process.exit(1)
  })
