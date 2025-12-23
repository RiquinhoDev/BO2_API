// ════════════════════════════════════════════════════════════════════════════
// 🎯 SCRIPT CONSERVADOR: Adicionar Tag (Preservando Dados Existentes)
// ════════════════════════════════════════════════════════════════════════════
// Apenas ADICIONA tag ao UserProduct e Active Campaign
// NÃO altera campos existentes (engagement, progress, etc)

import mongoose from 'mongoose'
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

// ════════════════════════════════════════════════════════════════════════════
// 🎯 CONFIGURAÇÃO
// ════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  targetEmail: 'joaomcf37@gmail.com',
  tagToAdd: 'OGI - Inativo 14d',
  tagsToRemove: [], // ✅ VAZIO = não remove nada
  
  // Active Campaign (URL do AC, NÃO MongoDB!)
  acApiUrl: process.env.AC_API_URL || 'https://osriquinhos.api-us1.com',
  acApiKey: process.env.AC_API_KEY || '',
  
  // MongoDB (para conexão)
  mongoUri: process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true',
}

// ════════════════════════════════════════════════════════════════════════════
// 📧 ACTIVE CAMPAIGN - Funções Auxiliares
// ════════════════════════════════════════════════════════════════════════════

async function findACContact(email: string) {
  const response = await axios.get(`${CONFIG.acApiUrl}/api/3/contacts`, {
    headers: { 'Api-Token': CONFIG.acApiKey },
    params: { email },
  })
  
  if (response.data.contacts?.length > 0) {
    return response.data.contacts[0]
  }
  return null
}

async function findACTag(tagName: string) {
  const response = await axios.get(`${CONFIG.acApiUrl}/api/3/tags`, {
    headers: { 'Api-Token': CONFIG.acApiKey },
    params: { search: tagName },
  })
  
  const tag = response.data.tags?.find((t: any) => t.tag === tagName)
  return tag || null
}

async function applyACTag(contactId: string, tagId: string) {
  try {
    await axios.post(
      `${CONFIG.acApiUrl}/api/3/contactTags`,
      {
        contactTag: {
          contact: contactId,
          tag: tagId,
        },
      },
      {
        headers: {
          'Api-Token': CONFIG.acApiKey,
          'Content-Type': 'application/json',
        },
      }
    )
    return { success: true }
  } catch (error: any) {
    // 422 = tag já existe (não é erro)
    if (error.response?.status === 422) {
      return { success: true, alreadyExists: true }
    }
    throw error
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🚀 FUNÇÃO PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

async function addTagConservative() {
  try {
    console.log('\n════════════════════════════════════════════════════════════')
    console.log('🎯 ADICIONAR TAG (Modo Conservador)')
    console.log('════════════════════════════════════════════════════════════\n')

    // ─────────────────────────────────────────────────────────────
    // 1. CONECTAR À BD
    // ─────────────────────────────────────────────────────────────
    console.log('📡 Conectando à MongoDB...')
    await mongoose.connect(CONFIG.mongoUri)
    console.log('✅ Conectado\n')

    // ─────────────────────────────────────────────────────────────
    // 2. CARREGAR MODELS
    // ─────────────────────────────────────────────────────────────
    const User = (await import('../src/models/user')).default
    const UserProduct = (await import('../src/models/UserProduct')).default
    const Product = (await import('../src/models/Product')).default  // ✅ ADICIONAR!

    // ─────────────────────────────────────────────────────────────
    // 3. BUSCAR USER
    // ─────────────────────────────────────────────────────────────
    console.log(`🔍 Buscando user: ${CONFIG.targetEmail}`)
    const user = await User.findOne({ email: CONFIG.targetEmail })

    if (!user) {
      throw new Error('❌ User não encontrado!')
    }

    console.log(`✅ User encontrado: ${user.name} (${user._id})\n`)

    // ─────────────────────────────────────────────────────────────
    // 4. BUSCAR USERPRODUCTS
    // ─────────────────────────────────────────────────────────────
    console.log('📦 Buscando UserProducts...')
    const userProducts = await UserProduct.find({ userId: user._id })
      .populate('productId', 'name code platform')

    console.log(`✅ ${userProducts.length} UserProducts encontrados\n`)

    if (userProducts.length === 0) {
      throw new Error('❌ Nenhum UserProduct encontrado!')
    }

    // ─────────────────────────────────────────────────────────────
    // 5. APLICAR TAG NO ACTIVE CAMPAIGN (UMA VEZ POR EMAIL)
    // ─────────────────────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📧 ACTIVE CAMPAIGN')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log(`🔍 Buscando contacto: ${CONFIG.targetEmail}`)
    const contact = await findACContact(CONFIG.targetEmail)

    if (!contact) {
      console.log('⚠️  Contacto não encontrado no AC - Saltando integração AC')
      console.log('   (Tags serão adicionadas apenas ao UserProduct)\n')
    } else {
      console.log(`✅ Contacto encontrado: ID ${contact.id}\n`)

      console.log(`🔍 Buscando tag: ${CONFIG.tagToAdd}`)
      const tag = await findACTag(CONFIG.tagToAdd)

      if (!tag) {
        console.log(`⚠️  Tag "${CONFIG.tagToAdd}" não encontrada no AC`)
        console.log('   (Tag será adicionada apenas ao UserProduct)\n')
      } else {
        console.log(`✅ Tag encontrada: ID ${tag.id}\n`)

        console.log(`➕ Aplicando tag ao contacto...`)
        const result = await applyACTag(contact.id, tag.id)

        if (result.alreadyExists) {
          console.log(`✅ Tag já estava aplicada no AC\n`)
        } else {
          console.log(`✅ Tag aplicada no AC com sucesso!\n`)
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 6. ATUALIZAR USERPRODUCTS (MODO CONSERVADOR)
    // ─────────────────────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('💾 ATUALIZANDO USERPRODUCTS (Modo Conservador)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    let updatedCount = 0

    for (const up of userProducts) {
      console.log(`📦 Produto: ${up.productId?.name || 'Unknown'}`)
      console.log(`   ID: ${up._id}`)

      // ✅ INICIALIZAR activeCampaignData (se não existir)
      if (!up.activeCampaignData) {
        up.activeCampaignData = {
          tags: [],
          lastSyncAt: new Date(),
        }
        console.log(`   🆕 Criado activeCampaignData`)
      }

      // ✅ GARANTIR que tags é um array
      if (!Array.isArray(up.activeCampaignData.tags)) {
        up.activeCampaignData.tags = []
        console.log(`   🔧 Corrigido activeCampaignData.tags para array`)
      }

      // ✅ VERIFICAR se tag já existe
      const tagExists = up.activeCampaignData.tags.includes(CONFIG.tagToAdd)

      if (tagExists) {
        console.log(`   ⏭️  Tag já existe - Saltando`)
      } else {
        // ✅ ADICIONAR tag (SEM REMOVER OUTRAS)
        up.activeCampaignData.tags.push(CONFIG.tagToAdd)
        console.log(`   ➕ Tag adicionada: ${CONFIG.tagToAdd}`)

        // ✅ ATUALIZAR lastSyncAt
        up.activeCampaignData.lastSyncAt = new Date()

        // ✅ SALVAR (com validação desativada para engagement)
        try {
          await up.save({ validateBeforeSave: false })
          console.log(`   💾 UserProduct salvo`)
          updatedCount++
        } catch (saveError: any) {
          console.error(`   ❌ Erro ao salvar:`, saveError.message)
          console.log(`   ⚠️  Tentando sem validação...`)
          
          // Fallback: update direto
          await UserProduct.updateOne(
            { _id: up._id },
            {
              $set: {
                'activeCampaignData.tags': up.activeCampaignData.tags,
                'activeCampaignData.lastSyncAt': up.activeCampaignData.lastSyncAt,
              },
            }
          )
          console.log(`   ✅ Atualizado via updateOne`)
          updatedCount++
        }
      }

      // ✅ MOSTRAR tags atuais
      console.log(`   📋 Tags atuais: ${up.activeCampaignData.tags.join(', ') || '(vazio)'}`)
      console.log()
    }

    // ─────────────────────────────────────────────────────────────
    // 7. RESUMO
    // ─────────────────────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎉 CONCLUÍDO COM SUCESSO!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`✅ Tag: ${CONFIG.tagToAdd}`)
    console.log(`✅ UserProducts atualizados: ${updatedCount}/${userProducts.length}`)
    console.log(`✅ Dados existentes preservados (engagement, progress, etc)`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('🔍 COMO VERIFICAR:')
    console.log(`1. Frontend: http://localhost:5173/activecampaign`)
    console.log(`   → Tab "Tags Reader"`)
    console.log(`   → Pesquisar: ${CONFIG.targetEmail}`)
    console.log(`   → Card "Tags do CRON" deve mostrar: ${CONFIG.tagToAdd}`)
    console.log()
    console.log(`2. API: curl http://localhost:3001/api/users/${user._id}/products`)
    console.log()
    console.log(`3. Active Campaign: https://osriquinhos.activehosted.com`)
    console.log(`   → Contacts → ${CONFIG.targetEmail} → Tags`)
    console.log()

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    if (error.response?.data) {
      console.error('Detalhes API:', error.response.data)
    }
  } finally {
    await mongoose.disconnect()
    console.log('📡 Desconectado da MongoDB\n')
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🎬 EXECUTAR
// ════════════════════════════════════════════════════════════════════════════

addTagConservative()