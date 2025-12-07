// ═══════════════════════════════════════════════════════════════════════════
// 🔍 SCRIPT DIAGNÓSTICO: Verificar Engagement nos UserProducts
// ═══════════════════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import UserProduct from '../src/models/UserProduct'
import User from '../src/models/user'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

async function diagnoseEngagement() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ MongoDB conectado\n')
    
    // ══════════════════════════════════════════════════════════
    // 1. SAMPLE: Buscar 10 UserProducts aleatórios
    // ══════════════════════════════════════════════════════════
    console.log('📊 AMOSTRA: 10 UserProducts aleatórios\n')
    
    const sample = await UserProduct.aggregate([
      { $sample: { size: 10 } }
    ])
    
    for (const up of sample) {
      const user: any = await User.findById(up.userId)
      
      console.log('─────────────────────────────────────────────')
      console.log(`📌 UserProduct ID: ${up._id}`)
      console.log(`   User: ${user?.name || 'N/A'}`)
      console.log(`   Platform: ${up.platform}`)
      console.log(`   Product: ${up.productId}`)
      console.log('')
      
      // Dados do UserProduct
      console.log('📦 UserProduct.engagement:')
      console.log(JSON.stringify(up.engagement, null, 2))
      console.log('')
      
      // Dados do User (V1)
      if (up.platform === 'hotmart' && user?.hotmart) {
        console.log('👤 User.hotmart.engagement:')
        console.log(JSON.stringify(user.hotmart.engagement, null, 2))
      } else if (up.platform === 'curseduca' && user?.curseduca) {
        console.log('👤 User.curseduca.engagement:')
        console.log(JSON.stringify(user.curseduca.engagement, null, 2))
      } else if (up.platform === 'discord' && user?.discord) {
        console.log('👤 User.discord (engagement):')
        console.log(`   engagementScore: ${user.discord.engagementScore}`)
      }
      console.log('')
    }
    
    // ══════════════════════════════════════════════════════════
    // 2. STATS: Quantos têm engagement?
    // ══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════')
    console.log('📊 ESTATÍSTICAS GLOBAIS')
    console.log('═══════════════════════════════════════════════\n')
    
    const total = await UserProduct.countDocuments({})
    console.log(`Total UserProducts: ${total}`)
    
    const withEngagement = await UserProduct.countDocuments({
      'engagement.engagementScore': { $exists: true, $gt: 0 }
    })
    console.log(`Com engagement > 0: ${withEngagement}`)
    
    const withoutEngagement = total - withEngagement
    console.log(`Sem engagement: ${withoutEngagement}`)
    console.log(`Percentagem com engagement: ${((withEngagement / total) * 100).toFixed(1)}%`)
    
    // ══════════════════════════════════════════════════════════
    // 3. POR PLATAFORMA
    // ══════════════════════════════════════════════════════════
    console.log('\n📦 POR PLATAFORMA:\n')
    
    for (const platform of ['hotmart', 'curseduca', 'discord']) {
      const totalPlatform = await UserProduct.countDocuments({ platform })
      const withEngPlatform = await UserProduct.countDocuments({
        platform,
        'engagement.engagementScore': { $exists: true, $gt: 0 }
      })
      
      console.log(`${platform}:`)
      console.log(`   Total: ${totalPlatform}`)
      console.log(`   Com engagement: ${withEngPlatform}`)
      console.log(`   %: ${totalPlatform > 0 ? ((withEngPlatform / totalPlatform) * 100).toFixed(1) : 0}%`)
      console.log('')
    }
    
    // ══════════════════════════════════════════════════════════
    // 4. VERIFICAR USER V1
    // ══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════')
    console.log('👤 VERIFICAR DADOS V1 (User)')
    console.log('═══════════════════════════════════════════════\n')
    
    const sampleUsers: any = await User.find({}).limit(5)
    
    for (const user of sampleUsers) {
      console.log(`User: ${user.name}`)
      
      if (user.hotmart?.engagement) {
        console.log(`   Hotmart engagement: ${user.hotmart.engagement.engagementScore || 'N/A'}`)
      }
      
      if (user.curseduca?.engagement) {
        console.log(`   CursEduca engagement: ${user.curseduca.engagement.alternativeEngagement || 'N/A'}`)
      }
      
      if (user.discord?.engagementScore !== undefined) {
        console.log(`   Discord engagement: ${user.discord.engagementScore}`)
      }
      
      console.log('')
    }
    
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await mongoose.disconnect()
  }
}

diagnoseEngagement()