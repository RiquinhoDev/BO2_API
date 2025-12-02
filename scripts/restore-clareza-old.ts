// BO2_API/scripts/restore-clareza-old.ts
import mongoose from 'mongoose'
import Product from '../src/models/Product'
import UserProduct from '../src/models/UserProduct'
import fs from 'fs'

async function restore() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    
    console.log('\n🔄 RESTAURAR PRODUTO CLAREZA ORIGINAL\n')
    console.log('═'.repeat(80))
    
    // Verificar se já existe
    const existing = await Product.findOne({ code: 'CLAREZA' })
    
    if (existing) {
      console.log('ℹ️  Produto CLAREZA já existe, nada a fazer\n')
      await mongoose.disconnect()
      return
    }
    
    // Ler backup
    const backupPath = 'C:\\Users\\User\\Documents\\GitHub\\Riquinho\\api\\Front\\BO2_API\\backups\\clareza-fix-backup-1764709611753.json'
    
    if (!fs.existsSync(backupPath)) {
      console.log('❌ Backup não encontrado!')
      console.log(`   Procurado em: ${backupPath}\n`)
      await mongoose.disconnect()
      return
    }
    
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'))
    const oldProduct = backup.products.find((p: any) => p.code === 'CLAREZA')
    
    if (!oldProduct) {
      console.log('❌ Produto CLAREZA não encontrado no backup\n')
      await mongoose.disconnect()
      return
    }
    
    // Recriar produto
    const restored = await Product.create({
      _id: oldProduct._id,
      code: oldProduct.code,
      name: oldProduct.name,
      platform: oldProduct.platform,
      courseId: oldProduct.courseId,
      curseducaGroupId: oldProduct.curseducaGroupId,
      isActive: oldProduct.isActive,
      description: oldProduct.description || 'Clareza'
    })
    
    console.log('✅ Produto CLAREZA restaurado:')
    console.log(`   ID: ${restored._id}`)
    console.log(`   Nome: ${restored.name}`)
    console.log(`   CourseId: ${restored.courseId}`)
    console.log(`   GroupId: ${restored.curseducaGroupId}\n`)
    
    // Restaurar UserProducts
    const oldUserProducts = backup.userProducts.filter((up: any) => 
      up.productId.toString() === oldProduct._id.toString()
    )
    
    console.log(`📦 Restaurando ${oldUserProducts.length} UserProducts...\n`)
    
    for (const up of oldUserProducts) {
      try {
        await UserProduct.create({
          _id: up._id,
          userId: up.userId,
          productId: up.productId,
          platform: up.platform,
          platformUserId: up.platformUserId,
          status: up.status,
          enrolledAt: up.enrolledAt,
          source: up.source
        })
      } catch (error: any) {
        // Ignorar duplicados (caso já exista)
        if (!error.message.includes('duplicate')) {
          console.error(`   ⚠️  Erro ao restaurar UserProduct ${up._id}: ${error.message}`)
        }
      }
    }
    
    const finalCount = await UserProduct.countDocuments({ productId: restored._id })
    console.log(`✅ ${finalCount} UserProducts restaurados\n`)
    
    console.log('═'.repeat(80))
    console.log('✅ RESTAURAÇÃO COMPLETA\n')
    
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await mongoose.disconnect()
  }
}

restore()