// ════════════════════════════════════════════════════════════════════════════
// 🧪 TEST: Verificar sync tags BO entre BD e AC para o Rui
// ════════════════════════════════════════════════════════════════════════════
//
// Este script testa especificamente se as tags BO do Rui estão sincronizadas
// entre a Base de Dados e o Active Campaign.
//
// ════════════════════════════════════════════════════════════════════════════

import 'dotenv/config'
import mongoose from 'mongoose'
import User from '../src/models/user'
import { UserProduct } from '../src/models'
import activeCampaignService from '../src/services/activeCampaign/activeCampaignService'

const RUI_EMAIL = 'ruifilipespteixeira@gmail.com'

async function testRuiTagsSync() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('🧪 TESTE: Sync Tags BO - Rui')
  console.log('════════════════════════════════════════════════════════════════\n')

  try {
    // 1. Conectar à BD
    await mongoose.connect(process.env.MONGO_URI!)
    console.log('✅ Conectado à BD\n')

    // 2. Buscar user Rui
    const user = await User.findOne({ email: RUI_EMAIL })

    if (!user) {
      console.error(`❌ User ${RUI_EMAIL} não encontrado na BD`)
      process.exit(1)
    }

    console.log(`👤 User: ${user.name || user.email}`)
    console.log(`   Email: ${user.email}`)
    console.log(`   ID: ${user._id}\n`)

    // 3. Buscar UserProducts
    const userProducts = await UserProduct.find({
      userId: String(user._id)
    }).populate('productId')

    console.log(`📦 UserProducts: ${userProducts.length}`)
    console.log('─'.repeat(60) + '\n')

    if (userProducts.length === 0) {
      console.log('⚪ Nenhum UserProduct encontrado\n')
      process.exit(0)
    }

    // 4. Para cada produto, comparar tags BD vs AC
    for (const userProduct of userProducts) {
      const product = userProduct.productId as any

      console.log(`\n📦 Produto: ${product.name} (${product.code})`)
      console.log('─'.repeat(60))

      // Tags na BD
      const bdTags = userProduct.activeCampaignData?.tags || []
      console.log(`\n📊 Tags na BD (${bdTags.length}):`)
      if (bdTags.length > 0) {
        bdTags.forEach((tag: string) => console.log(`   - ${tag}`))
      } else {
        console.log('   (nenhuma)')
      }

      // Tags no AC
      console.log('\n🔍 Buscando tags no AC...')
      const acTags = await activeCampaignService.getContactTagsByEmail(user.email)

      if (!acTags) {
        console.log('⚠️  Contacto não encontrado no AC ou erro ao buscar tags\n')
        continue
      }

      // Filtrar apenas tags BO
      const BO_TAG_PATTERN = /^[A-Z_0-9]+ - .+$/
      const boTagsInAC = acTags.filter((tag: string) => BO_TAG_PATTERN.test(tag))

      // ✅ CORREÇÃO: Produtos CLAREZA usam prefixo "CLAREZA -" (não "CLAREZA_MENSAL -")
      const productPrefixes = product.code.includes('CLAREZA')
        ? ['CLAREZA -', 'CLAREZA-', 'CLAREZA_MENSAL -', 'CLAREZA_ANUAL -']
        : [product.code + ' -']

      // Filtrar tags deste produto
      const productTagsInAC = boTagsInAC.filter((tag: string) =>
        productPrefixes.some(prefix => tag.startsWith(prefix))
      )

      console.log(`\n📊 Tags BO no AC para ${product.code} (${productTagsInAC.length}):`)
      if (productTagsInAC.length > 0) {
        productTagsInAC.forEach((tag: string) => console.log(`   - ${tag}`))
      } else {
        console.log('   (nenhuma)')
      }

      // Comparar
      console.log('\n🔍 Comparação:')

      const missingInAC = bdTags.filter(
        (tag: string) => !productTagsInAC.includes(tag)
      )
      const missingInBD = productTagsInAC.filter(
        (tag: string) => !bdTags.includes(tag)
      )

      if (missingInAC.length === 0 && missingInBD.length === 0) {
        console.log('   ✅ BD e AC SINCRONIZADOS!')
      } else {
        if (missingInAC.length > 0) {
          console.log(`   ❌ FALTAM no AC (${missingInAC.length}):`)
          missingInAC.forEach((tag: string) => console.log(`      - ${tag}`))
        }

        if (missingInBD.length > 0) {
          console.log(`   ❌ FALTAM na BD (${missingInBD.length}):`)
          missingInBD.forEach((tag: string) => console.log(`      - ${tag}`))
        }
      }
    }

    console.log('\n════════════════════════════════════════════════════════════════')
    console.log('✅ Teste concluído')
    console.log('════════════════════════════════════════════════════════════════\n')
  } catch (error: any) {
    console.error('\n❌ Erro:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('🔌 Conexão BD fechada\n')
  }
}

testRuiTagsSync()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Erro fatal:', error)
    process.exit(1)
  })
