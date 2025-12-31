// ═══════════════════════════════════════════════════════════════════════════
// 🔧 RECALCULAR ENGAGEMENT - SÓ RUI (DEBUG)
// ═══════════════════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import Product from '../src/models/Product'
import { calculateEngagementMetricsForUserProduct } from '../src/services/syncUtilziadoresServices/universalSyncService'

async function main() {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    console.log('✅ Conectado à MongoDB\n')

    const email = 'rui.santos@serriquinho.com'
    
    // 1. Buscar User
    const user = await User.findOne({ email }).lean()
    if (!user) {
      console.log('❌ User não encontrado!')
      return
    }
    
    console.log(`👤 User: ${email}`)
    console.log(`   ID: ${user._id}`)
    console.log()
    
    // 2. Buscar UserProducts CLAREZA
    const userProducts = await UserProduct.find({
      userId: user._id,
      platform: 'curseduca',
      status: 'ACTIVE'
    }).lean()
    
    console.log(`📦 UserProducts encontrados: ${userProducts.length}\n`)
    
    for (const up of userProducts) {
      // 3. Buscar Product (sem .lean() para manter tipo correto)
      const product = await Product.findById(up.productId)
      if (!product) {
        console.log(`   ⚠️  Produto não encontrado: ${up.productId}`)
        continue
      }
      
      console.log(`─`.repeat(70))
      console.log(`📦 Produto: ${product.code}`)
      console.log()
      
      // 4. ANTES (cast para any para evitar erros TypeScript)
      const upBefore = up as any
      console.log('ANTES:')
      console.log(`   engagement.daysSinceEnrollment: ${upBefore.engagement?.daysSinceEnrollment ?? 'undefined'}`)
      console.log(`   engagement.enrolledAt: ${upBefore.engagement?.enrolledAt ?? 'undefined'}`)
      console.log(`   engagement.daysSinceLastAction: ${upBefore.engagement?.daysSinceLastAction ?? 'undefined'}`)
      console.log()
      
      // 5. CALCULAR (user como any para compatibilidade)
      console.log('🔄 Calculando engagement metrics...')
      const metrics = calculateEngagementMetricsForUserProduct(user as any, product)
      
      console.log()
      console.log('MÉTRICAS CALCULADAS:')
      console.log(`   daysSinceEnrollment: ${metrics.engagement.daysSinceEnrollment ?? 'null'}`)
      console.log(`   enrolledAt: ${metrics.engagement.enrolledAt ?? 'null'}`)
      console.log(`   daysSinceLastAction: ${metrics.engagement.daysSinceLastAction ?? 'null'}`)
      console.log(`   daysSinceLastLogin: ${metrics.engagement.daysSinceLastLogin ?? 'null'}`)
      console.log()
      
      // 6. ATUALIZAR
      const updateFields: Record<string, any> = {}
      
      if (metrics.engagement.daysSinceEnrollment !== null) {
        updateFields['engagement.daysSinceEnrollment'] = metrics.engagement.daysSinceEnrollment
      }
      
      if (metrics.engagement.enrolledAt !== null) {
        updateFields['engagement.enrolledAt'] = metrics.engagement.enrolledAt
      }
      
      if (metrics.engagement.daysSinceLastAction !== null) {
        updateFields['engagement.daysSinceLastAction'] = metrics.engagement.daysSinceLastAction
      }
      
      if (Object.keys(updateFields).length > 0) {
        await UserProduct.findByIdAndUpdate(up._id, { $set: updateFields })
        console.log('✅ UserProduct atualizado!')
      } else {
        console.log('⚠️  Nenhum campo para atualizar')
      }
      
      // 7. DEPOIS
      const updatedUP = await UserProduct.findById(up._id).lean() as any
      console.log()
      console.log('DEPOIS:')
      console.log(`   engagement.daysSinceEnrollment: ${updatedUP?.engagement?.daysSinceEnrollment ?? 'undefined'}`)
      console.log(`   engagement.enrolledAt: ${updatedUP?.engagement?.enrolledAt ?? 'undefined'}`)
      console.log(`   engagement.daysSinceLastAction: ${updatedUP?.engagement?.daysSinceLastAction ?? 'undefined'}`)
      console.log()
    }
    
    console.log('═'.repeat(70))
    console.log('✅ Recálculo completo!')

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n✅ Desconectado')
  }
}

main()