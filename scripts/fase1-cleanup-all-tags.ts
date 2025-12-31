// ════════════════════════════════════════════════════════════
// 🚀 FASE 1: LIMPEZA ULTRA-RÁPIDA (OTIMIZADA)
// Remove tags BO com cache e parallel processing
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import axios from 'axios'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import '../src/models'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'

const MONGO_URL = 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'
const API_URL = 'https://serriquinho71518.api-us1.com'
const API_KEY = '***REMOVED-SECRET***'

console.clear()
console.log('═'.repeat(70))
console.log('🚀 FASE 1: LIMPEZA ULTRA-RÁPIDA')
console.log('═'.repeat(70))
console.log()

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO OTIMIZADA
// ═══════════════════════════════════════════════════════════

const DRY_RUN = false
const BATCH_SIZE = 100          // ⚡ Aumentado de 50
const PARALLEL_REQUESTS = 5     // ⚡ NOVO: Processar 5 users em paralelo
const DELAY_MS = 50             // ⚡ Reduzido de 300ms

const BO_TAG_PREFIXES = [
  'CLAREZA_MENSAL',
  'CLAREZA_ANUAL',
  'OGI_V1',
  'DISCORD_COMMUNITY'
]

// ═══════════════════════════════════════════════════════════
// CLIENT AC
// ═══════════════════════════════════════════════════════════

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Api-Token': API_KEY,
    'Content-Type': 'application/json'
  }
})

// ═══════════════════════════════════════════════════════════
// ⚡ CACHE DE TAGS (EVITA BUSCAR MESMA TAG 1000x!)
// ═══════════════════════════════════════════════════════════

const tagCache = new Map<string, { tagName: string; isBO: boolean }>()

async function getTagInfo(tagId: string): Promise<{ tagName: string; isBO: boolean }> {
  // Check cache primeiro
  if (tagCache.has(tagId)) {
    return tagCache.get(tagId)!
  }

  try {
    const tagResponse = await client.get(`/api/3/tags/${tagId}`)
    const tagName = tagResponse.data.tag.tag
    const isBO = BO_TAG_PREFIXES.some(prefix => tagName.startsWith(prefix))

    const info = { tagName, isBO }
    tagCache.set(tagId, info)
    
    return info
  } catch (error) {
    // Se falhar, assumir que não é BO
    const info = { tagName: tagId, isBO: false }
    tagCache.set(tagId, info)
    return info
  }
}

// ═══════════════════════════════════════════════════════════
// ⚡ FUNÇÃO OTIMIZADA: REMOVER TAGS (SEM DELAYS DESNECESSÁRIOS)
// ═══════════════════════════════════════════════════════════

async function removeBOTagsFromContact(email: string): Promise<{
  removed: number
  errors: number
}> {
  let removed = 0
  let errors = 0

  try {
    // 1. Buscar contacto
    const contactResponse = await client.get('/api/3/contacts', {
      params: { email }
    })

    const contact = contactResponse.data.contacts[0]
    if (!contact) {
      return { removed, errors }
    }

    const contactId = contact.id

    // 2. Buscar tags do contacto
    const contactTagsResponse = await client.get(
      `/api/3/contacts/${contactId}/contactTags`
    )

    const contactTags = contactTagsResponse.data.contactTags || []
    if (contactTags.length === 0) {
      return { removed, errors }
    }

    // 3. ⚡ BUSCAR TODAS AS TAGS EM PARALELO (NÃO UMA A UMA!)
    const tagInfoPromises = contactTags.map((ct: any) => 
      getTagInfo(ct.tag).then(info => ({ contactTagId: ct.id, ...info }))
    )

    const allTagsInfo = await Promise.all(tagInfoPromises)

    // 4. Filtrar só tags BO
    const boContactTags = allTagsInfo.filter(t => t.isBO)

    if (boContactTags.length === 0) {
      return { removed, errors }
    }

    // 5. ⚡ REMOVER TAGS EM PARALELO (COM PEQUENO DELAY)
    const deletePromises = boContactTags.map((boTag, index) => 
      new Promise(async (resolve) => {
        // Delay escalonado (evita burst)
        await new Promise(r => setTimeout(r, index * DELAY_MS))
        
        try {
          await client.delete(`/api/3/contactTags/${boTag.contactTagId}`)
          removed++
          resolve(true)
        } catch (error: any) {
          errors++
          resolve(false)
        }
      })
    )

    await Promise.all(deletePromises)

  } catch (error: any) {
    errors++
  }

  return { removed, errors }
}

// ═══════════════════════════════════════════════════════════
// ⚡ PROCESSAR USERS EM PARALELO
// ═══════════════════════════════════════════════════════════

async function processUserBatch(users: any[]): Promise<{
  totalRemoved: number
  totalErrors: number
  usersWithTags: number
}> {
  const results = {
    totalRemoved: 0,
    totalErrors: 0,
    usersWithTags: 0
  }

  // Dividir em chunks para processar em paralelo
  for (let i = 0; i < users.length; i += PARALLEL_REQUESTS) {
    const chunk = users.slice(i, i + PARALLEL_REQUESTS)

    // ⚡ PROCESSAR 5 USERS AO MESMO TEMPO!
    const promises = chunk.map(async (user) => {
      const result = await removeBOTagsFromContact(user.email)

      // Limpar BD também
      await UserProduct.updateMany(
        { userId: user._id },
        {
          $set: {
            'activeCampaignData.tags': [],
            'activeCampaignData.lastSyncAt': new Date()
          }
        }
      )

      return {
        email: user.email,
        removed: result.removed,
        errors: result.errors
      }
    })

    const chunkResults = await Promise.all(promises)

    // Agregar resultados
    for (const r of chunkResults) {
      results.totalRemoved += r.removed
      results.totalErrors += r.errors
      if (r.removed > 0) results.usersWithTags++

      // Log simplificado
      if (r.removed > 0) {
        console.log(`   ✅ ${r.email}: ${r.removed} tags`)
      }
    }
  }

  return results
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════

async function main() {
  const startTime = Date.now()

  try {
    await mongoose.connect(MONGO_URL)
    console.log('✅ Conectado ao MongoDB')
    console.log()

    // ═══════════════════════════════════════════════════════════
    // BUSCAR USERS RESTANTES (A PARTIR DO 3027)
    // ═══════════════════════════════════════════════════════════

    console.log('📡 Buscando users ativos...')

    const users = await User.find({
      'combined.status': 'ACTIVE'
    })
      .select('email _id')
      .skip(3027)  // ⚡ COMEÇAR DO 3027 (já processados)

    console.log(`✅ ${users.length} users restantes`)
    console.log()

    if (users.length === 0) {
      console.log('🎉 Todos os users já foram processados!')
      return
    }

    // ═══════════════════════════════════════════════════════════
    // PROCESSAR EM BATCHES
    // ═══════════════════════════════════════════════════════════

    const batches = []
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      batches.push(users.slice(i, i + BATCH_SIZE))
    }

    console.log(`📦 ${batches.length} batches (${PARALLEL_REQUESTS} users em paralelo)`)
    console.log()

    let totalRemoved = 0
    let totalErrors = 0
    let usersProcessed = 0
    let usersWithTags = 0

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]

      console.log(`═`.repeat(70))
      console.log(`📦 BATCH ${batchIndex + 1}/${batches.length} (${3027 + usersProcessed + 1}-${3027 + usersProcessed + batch.length})`)
      console.log(`═`.repeat(70))

      if (DRY_RUN) {
        console.log('   🔍 [DRY RUN] Simulando...')
        await new Promise(resolve => setTimeout(resolve, 100))
        usersProcessed += batch.length
        continue
      }

      // ⚡ PROCESSAR BATCH EM PARALELO
      const results = await processUserBatch(batch)

      totalRemoved += results.totalRemoved
      totalErrors += results.totalErrors
      usersWithTags += results.usersWithTags
      usersProcessed += batch.length

      // Stats do batch
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      const rate = usersProcessed / elapsed
      const remaining = users.length - usersProcessed
      const eta = Math.round(remaining / rate / 60)

      console.log(`   📊 Batch: ${results.totalRemoved} tags removidas`)
      console.log(`   ⏱️  Taxa: ${rate.toFixed(1)} users/s | ETA: ${eta} min`)
      console.log()
    }

    // ═══════════════════════════════════════════════════════════
    // RESULTADO FINAL
    // ═══════════════════════════════════════════════════════════

    const duration = Math.round((Date.now() - startTime) / 1000)

    console.log('═'.repeat(70))
    console.log('📊 RESULTADO FINAL')
    console.log('═'.repeat(70))
    console.log()
    console.log(`Users processados: ${usersProcessed + 3027} / 4287`)
    console.log(`Users com tags BO: ${usersWithTags}`)
    console.log(`Tags removidas (AC): ${totalRemoved}`)
    console.log(`Erros: ${totalErrors}`)
    console.log(`Duração: ${duration}s (~${Math.round(duration / 60)} min)`)
    console.log(`Cache de tags: ${tagCache.size} tags`)
    console.log()

    console.log('✅ LIMPEZA COMPLETA!')
    console.log()

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('👋 Desconectado')
  }
}

main()