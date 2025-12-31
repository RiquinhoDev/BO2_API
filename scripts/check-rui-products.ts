// ═══════════════════════════════════════════════════════════
// 🔍 CONSULTA: Produtos do Rui Santos
// ═══════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import '../src/models'  // 👈 IMPORTAR TODOS OS MODELS!
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import Product from '../src/models/Product'

async function main() {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    console.log('✅ Conectado à MongoDB\n')

    const email = 'rui.santos@serriquinho.com'
    
    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR USER
    // ═══════════════════════════════════════════════════════════
    
    const user = await User.findOne({ email }).lean()
    if (!user) {
      console.log('❌ User não encontrado!')
      return
    }
    
    console.log('👤 USER:')
    console.log(`   Email: ${email}`)
    console.log(`   ID: ${user._id}`)
    console.log(`   Nome: ${user.name || 'N/A'}`)
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // 2. BUSCAR USERPRODUCTS
    // ═══════════════════════════════════════════════════════════
    
    const userProducts = await UserProduct.find({ userId: user._id })
      .populate('productId', 'code name platform')
      .lean()
    
    console.log(`📦 PRODUTOS: ${userProducts.length} encontrados\n`)
    
    if (userProducts.length === 0) {
      console.log('⚠️  Nenhum produto encontrado para este user')
      return
    }
    
    // ═══════════════════════════════════════════════════════════
    // 3. LISTAR CADA PRODUTO
    // ═══════════════════════════════════════════════════════════
    
    for (let i = 0; i < userProducts.length; i++) {
      const up = userProducts[i] as any
      const product = up.productId
      
      console.log(`─`.repeat(70))
      console.log(`📦 PRODUTO ${i + 1}/${userProducts.length}`)
      console.log(`─`.repeat(70))
      console.log()
      console.log(`Código: ${product?.code || 'N/A'}`)
      console.log(`Nome: ${product?.name || 'N/A'}`)
      console.log(`Platform: ${product?.platform || 'N/A'}`)
      console.log()
      console.log(`Status: ${up.status}`)
      console.log(`EnrolledAt: ${up.enrolledAt ? new Date(up.enrolledAt).toISOString() : 'N/A'}`)
      console.log(`Source: ${up.source}`)
      console.log()
      
      // ENGAGEMENT
      console.log(`ENGAGEMENT:`)
      console.log(`   daysSinceLastLogin: ${up.engagement?.daysSinceLastLogin ?? 'N/A'}`)
      console.log(`   daysSinceLastAction: ${up.engagement?.daysSinceLastAction ?? 'N/A'}`)
      console.log(`   daysSinceEnrollment: ${up.engagement?.daysSinceEnrollment ?? 'N/A'}`)
      console.log(`   enrolledAt: ${up.engagement?.enrolledAt ? new Date(up.engagement.enrolledAt).toISOString() : 'N/A'}`)
      console.log()
      
      // PROGRESS
      console.log(`PROGRESS:`)
      console.log(`   percentage: ${up.progress?.percentage ?? 'N/A'}%`)
      console.log(`   currentModule: ${up.progress?.currentModule ?? 'N/A'}`)
      console.log()
      
      // TAGS
      const tags = up.activeCampaignData?.tags || []
      console.log(`TAGS ACTIVE CAMPAIGN: ${tags.length}`)
      if (tags.length > 0) {
        tags.forEach((tag: string) => console.log(`   - ${tag}`))
      } else {
        console.log(`   (sem tags)`)
      }
      console.log()
    }
    
    console.log(`═`.repeat(70))
    console.log(`✅ Consulta completa!`)
    console.log(`═`.repeat(70))

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n✅ Desconectado')
  }
}

main()