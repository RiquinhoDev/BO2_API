// ═══════════════════════════════════════════════════════════════════════════
// 🔧 SCRIPT FINAL: Recalcular Engagement e Progress em UserProducts
// ═══════════════════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import UserProduct from '../src/models/UserProduct'
import User from '../src/models/user'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

async function recalculateStats() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ MongoDB conectado')
    
    const userProducts = await UserProduct.find({})
    console.log(`\n📊 Total UserProducts: ${userProducts.length}`)
    
    let updated = 0
    let skipped = 0
    let errors = 0
    
    for (const up of userProducts) {
      try {
        const user: any = await User.findById(up.userId)
        
        if (!user) {
          skipped++
          continue
        }
        
        let progressData: any = { percentage: 0 }
        let engagementData: any = { engagementScore: 0 }
        
        // ══════════════════════════════════════════════════════════
        // HOTMART
        // ══════════════════════════════════════════════════════════
        if (up.platform === 'hotmart' && user.hotmart) {
          const totalLessons = user.hotmart.progress?.lessonsData?.length || 0
          const completedCount = user.hotmart.progress?.completedLessons || 0
          const percentage = totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0
          
          progressData = {
            percentage: Math.round(percentage),
            lastActivity: user.hotmart.progress?.lastAccessDate || null
          }
          
          engagementData = {
            engagementScore: user.hotmart.engagement?.engagementScore || 0
          }
        }
        
        // ══════════════════════════════════════════════════════════
        // CURSEDUCA
        // ══════════════════════════════════════════════════════════
        else if (up.platform === 'curseduca' && user.curseduca) {
          progressData = {
            percentage: user.curseduca.progress?.estimatedProgress || 0
          }
          
          engagementData = {
            engagementScore: user.curseduca.engagement?.alternativeEngagement || 0
          }
        }
        
        // ══════════════════════════════════════════════════════════
        // DISCORD
        // ══════════════════════════════════════════════════════════
        else if (up.platform === 'discord' && user.discord) {
          progressData = {
            percentage: 0
          }
          
          engagementData = {
            engagementScore: user.discord.engagementScore || 0
          }
        }
        
        // ══════════════════════════════════════════════════════════
        // SALVAR
        // ══════════════════════════════════════════════════════════
        up.progress = progressData
        up.engagement = engagementData
        await up.save()
        
        updated++
        
        if (updated % 100 === 0) {
          console.log(`📈 ${updated}/${userProducts.length}`)
        }
        
      } catch (error) {
        console.error(`❌ Erro UserProduct ${up._id}:`, error)
        errors++
      }
    }
    
    console.log('\n✅ CONCLUÍDO!')
    console.log(`   - Atualizados: ${updated}`)
    console.log(`   - Skipped: ${skipped}`)
    console.log(`   - Erros: ${errors}`)
    
  } catch (error) {
    console.error('❌ Erro fatal:', error)
  } finally {
    await mongoose.disconnect()
  }
}

recalculateStats()