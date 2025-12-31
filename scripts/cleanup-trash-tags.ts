// ════════════════════════════════════════════════════════════
// 🧹 LIMPAR TAGS ANTIGAS/LIXO DO ACTIVECAMPAIGN
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import '../src/models'
import UserProduct from '../src/models/UserProduct'
import activeCampaignService from '../src/services/ac/activeCampaignService'

const MONGO_URL = 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

const TEST_EMAIL = 'joaomcf37@gmail.com'

console.clear()
console.log('═'.repeat(70))
console.log('🧹 LIMPAR TAGS ANTIGAS DO ACTIVECAMPAIGN')
console.log('═'.repeat(70))
console.log()

async function main() {
  try {
    await mongoose.connect(MONGO_URL)
    console.log('✅ Conectado ao MongoDB')
    console.log()

    // Buscar UserProduct
    const up = await UserProduct.findOne({ userId: '68ea8abc4ac8223d08a22cd5' })
    if (!up) {
      console.log('❌ UserProduct não encontrado')
      return
    }

    const currentTags = up.activeCampaignData?.tags || []
    console.log(`📋 Tags atuais: ${currentTags.length}`)
    currentTags.forEach((t: string) => console.log(`   - ${t}`))
    console.log()

    // Tags lixo (prefixo errado ou sem prefixo)
    const trashTags = currentTags.filter((t: string) => {
      return t.startsWith('V1 - ') || 
             (!t.startsWith('OGI_V1 - ') && 
              (t.includes('Inativo') || t.includes('Progresso') || t.includes('Ativo')))
    })

    console.log(`🗑️  Tags lixo identificadas: ${trashTags.length}`)
    trashTags.forEach((t: string) => console.log(`   - ${t}`))
    console.log()

    if (trashTags.length === 0) {
      console.log('✅ Nenhuma tag lixo encontrada!')
      return
    }

    console.log('🧹 Removendo tags lixo...')
    console.log()

    for (const tag of trashTags) {
      await activeCampaignService.removeTagFromUserProduct(
        up.userId.toString(),
        up.productId.toString(),
        tag
      )
      console.log(`   ✅ Removida: ${tag}`)
    }

    console.log()
    console.log('═'.repeat(70))
    console.log('✅ LIMPEZA COMPLETA!')
    console.log('═'.repeat(70))

    // Verificar estado final
    const upFinal = await UserProduct.findOne({ userId: '68ea8abc4ac8223d08a22cd5' })
    const finalTags = upFinal?.activeCampaignData?.tags || []
    
    console.log()
    console.log(`📋 Tags finais: ${finalTags.length}`)
    finalTags.forEach((t: string) => console.log(`   ✅ ${t}`))

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
  } finally {
    await mongoose.disconnect()
    console.log()
    console.log('👋 Desconectado')
  }
}

main()