// ════════════════════════════════════════════════════════════════════════════
// 🧪 TEST: Forçar aplicação de tags CLAREZA para o Rui
// ════════════════════════════════════════════════════════════════════════════
//
// Este script testa a aplicação manual de tags CLAREZA para verificar se
// o tagOrchestrator consegue aplicá-las no Active Campaign.
//
// ════════════════════════════════════════════════════════════════════════════

import 'dotenv/config'
import mongoose from 'mongoose'
import User from '../src/models/user'
import { UserProduct } from '../src/models'
import { tagOrchestratorV2 } from '../src/services/activeCampaign/tagOrchestrator.service'

const RUI_EMAIL = 'ruifilipespteixeira@gmail.com'

async function testApplyClarezaTags() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('🧪 TESTE: Aplicar Tags CLAREZA - Rui')
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

    // 3. Buscar UserProducts CLAREZA
    const userProducts = await UserProduct.find({
      userId: String(user._id)
    }).populate('productId')

    const clarezaProducts = userProducts.filter((up: any) => {
      const code = up.productId?.code || ''
      return code.includes('CLAREZA')
    })

    console.log(`📦 UserProducts CLAREZA: ${clarezaProducts.length}`)
    console.log('─'.repeat(60) + '\n')

    if (clarezaProducts.length === 0) {
      console.log('⚪ Nenhum produto CLAREZA encontrado\n')
      process.exit(0)
    }

    // 4. Para cada produto CLAREZA, executar tagOrchestrator
    for (const userProduct of clarezaProducts) {
      const product = userProduct.productId as any

      console.log(`\n📦 Produto: ${product.name} (${product.code})`)
      console.log('═'.repeat(60))

      // Executar tagOrchestrator
      console.log('\n🎭 Executando TagOrchestrator...\n')

      const result = await tagOrchestratorV2.orchestrateUserProduct(
        String(user._id),
        String(product._id)
      )

      console.log('\n📊 Resultado:')
      console.log(`   Success: ${result.success}`)
      console.log(`   Tags Applied: ${result.tagsApplied.length}`)
      console.log(`   Tags Removed: ${result.tagsRemoved.length}`)

      if (result.tagsApplied.length > 0) {
        console.log('\n   ✅ Tags Aplicadas:')
        result.tagsApplied.forEach((tag: string) => console.log(`      - ${tag}`))
      }

      if (result.tagsRemoved.length > 0) {
        console.log('\n   ❌ Tags Removidas:')
        result.tagsRemoved.forEach((tag: string) => console.log(`      - ${tag}`))
      }

      if (result.error) {
        console.log(`\n   ❌ Erro: ${result.error}`)
      }

      console.log('\n' + '═'.repeat(60))
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

testApplyClarezaTags()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Erro fatal:', error)
    process.exit(1)
  })
