// ════════════════════════════════════════════════════════════
// 📁 BO2_API/scripts/validate-migration.ts
// SCRIPT: Validar que a migração está correta
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import Product from '../src/models/Product'
import UserProduct from '../src/models/UserProduct'
import User from '../src/models/user'

async function validateMigration() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    
    console.log('\n🔍 VALIDAÇÃO DA MIGRAÇÃO\n')
    console.log('════════════════════════════════════════════════════════════\n')
    
    // Stats gerais
    const totalUsers = await User.countDocuments()
    const totalProducts = await Product.countDocuments({ isActive: true })
    const totalUserProducts = await UserProduct.countDocuments()
    
    console.log('📊 ESTATÍSTICAS GERAIS:\n')
    console.log(`   Total Users: ${totalUsers}`)
    console.log(`   Total Produtos: ${totalProducts}`)
    console.log(`   Total UserProducts: ${totalUserProducts}`)
    console.log('')
    
    // Validar cada produto
    console.log('📦 VALIDAÇÃO POR PRODUTO:\n')
    
    const products = await Product.find({ isActive: true })
    
    for (const product of products) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`${product.code} - ${product.name}`)
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      
      // UserProducts
      const userProductsCount = await UserProduct.countDocuments({ productId: product._id })
      console.log(`✅ UserProducts: ${userProductsCount}`)
      
      // Users V1
      let v1Count = 0
      if (product.platform === 'hotmart') {
        v1Count = await User.countDocuments({ 'hotmart.hotmartUserId': { $exists: true } })
      } else if (product.platform === 'curseduca') {
        if (product.curseducaGroupId || product.curseducaGroupUuid) {
          const filter: any = {}
          if (product.curseducaGroupId) filter['curseduca.groupCurseducaId'] = product.curseducaGroupId
          if (product.curseducaGroupUuid) filter['curseduca.groupCurseducaUuid'] = product.curseducaGroupUuid
          v1Count = await User.countDocuments(filter)
        } else {
          v1Count = await User.countDocuments({ 'curseduca.curseducaUserId': { $exists: true } })
        }
      } else if (product.platform === 'discord') {
        v1Count = await User.countDocuments({ 'discord.discordIds': { $exists: true, $ne: [] } })
      }
      
      console.log(`📊 Users V1: ${v1Count}`)
      
      // Comparar
      if (userProductsCount < v1Count) {
        const diff = v1Count - userProductsCount
        console.log(`⚠️  FALTA MIGRAR: ${diff} users`)
      } else if (userProductsCount === v1Count) {
        console.log(`✅ MIGRAÇÃO COMPLETA!`)
      } else {
        console.log(`ℹ️  UserProducts > V1 (pode ser correto se houve múltiplos syncs)`)
      }
      
      // Datas de enrollment
      const withDates = await UserProduct.countDocuments({
        productId: product._id,
        enrolledAt: { $exists: true, $ne: null }
      })
      console.log(`📅 Com datas válidas: ${withDates}/${userProductsCount} (${Math.round((withDates/userProductsCount)*100)}%)`)
      
      console.log('')
    }
    
    console.log('════════════════════════════════════════════════════════════')
    console.log('✅ VALIDAÇÃO COMPLETA')
    console.log('════════════════════════════════════════════════════════════\n')
    
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await mongoose.disconnect()
  }
}

validateMigration()