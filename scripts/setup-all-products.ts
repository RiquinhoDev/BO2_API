// ════════════════════════════════════════════════════════════
// 📁 BO2_API/scripts/setup-all-products.ts
// SCRIPT: Garantir que TODOS os produtos base existem
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import Product from '../src/models/Product'

async function setupAllProducts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')

    console.log('\n🔧 CONFIGURANDO PRODUTOS BASE\n')

    // ✅ Produtos que DEVEM existir na coleção `products`
    const productsToCreate = [
      // CLAREZA (CursEduca)
      {
        code: 'CLAREZA',
        name: 'Clareza - Mensal',
        description: 'Clareza - Mensal (CursEduca)',
        platform: 'curseduca' as const,
        curseducaGroupId: '6', // o que já tens na BD
        curseducaGroupUuid: 'e0e74523-a8f7-41dd-9813-a557ee51d46b',
        isActive: true,
      },

      // OGI V1 (Hotmart)
      {
        code: 'OGI_V1',
        name: 'OGI V1',
        description: 'OGI Versão 1 (Hotmart)',
        platform: 'hotmart' as const,
        hotmartProductId: 'OGI_V1',
        isActive: true,
      },

      // Comunidade Discord
      {
        code: 'DISCORD_COMMUNITY',
        name: 'Comunidade Discord',
        description: 'Acesso à comunidade Discord do Riquinho',
        platform: 'discord' as const,
        isActive: true,
      },
    ]

    for (const productData of productsToCreate) {
      const existing = await Product.findOne({ code: productData.code })

      if (existing) {
        console.log(`✅ Produto já existe: ${productData.code}`)
        // Opcional: aqui podias fazer pequenos updates se quiseres alinhar campos
        // ex: garantir que isActive = true, description correta, etc.
        // await Product.updateOne({ _id: existing._id }, { $set: { isActive: true } })
        continue
      }

      // Criar produto novo
      const product = await Product.create({
        ...productData,
        // Se o teu schema tiver defaults para estas configs, podes remover esta parte
        activeCampaignConfig: {
          automationIds: [],
        },
        settings: {
          allowMultipleEnrollments: false,
          requiresApproval: false,
        },
      })

      console.log(`🆕 Produto criado: ${product.code} (${product.name})`)
      console.log(`   ID: ${product._id}`)
      console.log(`   Plataforma: ${product.platform}`)
    }

    // Listar todos os produtos ativos
    console.log('\n📦 PRODUTOS ATIVOS NO SISTEMA:\n')
    const allProducts = await Product.find({ isActive: true })

    allProducts.forEach((p, i) => {
      console.log(`${i + 1}. ${p.code} - ${p.name}`)
      console.log(`   ID: ${p._id}`)
      console.log(`   Plataforma: ${p.platform}`)
      console.log('')
    })

    console.log(`✅ Total: ${allProducts.length} produtos ativos\n`)
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await mongoose.disconnect()
  }
}

setupAllProducts()
