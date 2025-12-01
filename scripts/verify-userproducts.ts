// ════════════════════════════════════════════════════════════
// 📁 BO2_API/scripts/verify-userproducts.ts
// SCRIPT: Verificar UserProducts por produto
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import Product from '../src/models/Product'
import UserProduct from '../src/models/UserProduct'
import User from '../src/models/user'

async function verifyUserProducts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    
    console.log('\n🔍 VERIFICANDO USERPRODUCTS POR PRODUTO\n')
    
    const products = await Product.find({ isActive: true })
    
    for (const product of products) {
      console.log(`\n📦 Produto: ${product.code} (${product.name})`)
      console.log(`   Plataforma: ${product.platform}`)
      
      // Contar UserProducts
      const userProductsCount = await UserProduct.countDocuments({ productId: product._id })
      console.log(`   ✅ UserProducts: ${userProductsCount}`)
      
      // Se tem 0, verificar Users V1
      if (userProductsCount === 0) {
        console.log(`   ⚠️  Sem UserProducts! Verificando Users V1...`)
        
        let v1Count = 0
        
        if (product.platform === 'hotmart') {
          v1Count = await User.countDocuments({ 'hotmart.hotmartUserId': { $exists: true } })
          console.log(`   📊 Users V1 com Hotmart: ${v1Count}`)
        } else if (product.platform === 'curseduca') {
          v1Count = await User.countDocuments({ 'curseduca.curseducaUserId': { $exists: true } })
          console.log(`   📊 Users V1 com CursEduca: ${v1Count}`)
        } else if (product.platform === 'discord') {
          v1Count = await User.countDocuments({ 'discord.discordIds': { $exists: true, $ne: [] } })
          console.log(`   📊 Users V1 com Discord: ${v1Count}`)
        }
        
        if (v1Count > 0) {
          console.log(`   💡 AÇÃO NECESSÁRIA: Migrar ${v1Count} users V1 para UserProducts`)
        }
      }
    }
    
    console.log('\n✅ Verificação completa\n')
    
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await mongoose.disconnect()
  }
}

verifyUserProducts()