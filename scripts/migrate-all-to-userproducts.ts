// ════════════════════════════════════════════════════════════
// 📁 BO2_API/scripts/migrate-all-to-userproducts.ts
// SCRIPT: Migração completa e inteligente V1 → UserProducts
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import Product from '../src/models/Product'
import UserProduct from '../src/models/UserProduct'
import User from '../src/models/user'

async function migrateAllToUserProducts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true')
    
    console.log('\n🔄 MIGRAÇÃO COMPLETA V1 → USERPRODUCTS\n')
    console.log('════════════════════════════════════════════════════════════\n')
    
    const products = await Product.find({ isActive: true })
    console.log(`📦 Encontrados ${products.length} produtos ativos\n`)
    
    let totalCreated = 0
    let totalSkipped = 0
    let totalErrors = 0
    
    for (const product of products) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`📦 PROCESSANDO: ${product.code} (${product.name})`)
      console.log(`   Plataforma: ${product.platform}`)
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
      
      // Verificar UserProducts existentes
      const existingCount = await UserProduct.countDocuments({ productId: product._id })
      console.log(`   📊 UserProducts existentes: ${existingCount}`)
      
      // Buscar users V1 baseado na plataforma
      let users: any[] = []
      let filterDescription = ''
      
      if (product.platform === 'hotmart') {
        // HOTMART: Buscar users com hotmart.hotmartUserId
        users = await User.find({ 
          'hotmart.hotmartUserId': { $exists: true, $ne: null }
        }).lean()
        filterDescription = 'Users com hotmart.hotmartUserId'
        
      } else if (product.platform === 'curseduca') {
        // CURSEDUCA: Buscar users do grupo específico
        if (product.curseducaGroupId || product.curseducaGroupUuid) {
          const filter: any = {}
          
          if (product.curseducaGroupId) {
            filter['curseduca.groupCurseducaId'] = product.curseducaGroupId
          }
          if (product.curseducaGroupUuid) {
            filter['curseduca.groupCurseducaUuid'] = product.curseducaGroupUuid
          }
          
          users = await User.find(filter).lean()
          filterDescription = `Users do grupo ${product.curseducaGroupId || product.curseducaGroupUuid}`
          
        } else {
          // Se não tem ID do grupo, buscar todos com CursEduca
          users = await User.find({ 
            'curseduca.curseducaUserId': { $exists: true, $ne: null }
          }).lean()
          filterDescription = 'Users com curseduca.curseducaUserId (TODOS)'
        }
        
      } else if (product.platform === 'discord') {
        // DISCORD: Buscar users com discord.discordIds
        users = await User.find({ 
          'discord.discordIds': { $exists: true, $ne: [] }
        }).lean()
        filterDescription = 'Users com discord.discordIds'
      }
      
      console.log(`   🔍 ${filterDescription}`)
      console.log(`   📊 Encontrados: ${users.length} users V1\n`)
      
      if (users.length === 0) {
        console.log(`   ⚠️  Nenhum user V1 encontrado. Pulando...\n`)
        continue
      }
      
      // Processar cada user
      let created = 0
      let skipped = 0
      let errors = 0
      
      for (const user of users) {
        try {
          // Verificar se já existe UserProduct para este user+produto
          const exists = await UserProduct.findOne({
            userId: user._id,
            productId: product._id
          })
          
          if (exists) {
            skipped++
            continue
          }
          
          // ─────────────────────────────────────────────────
          // DETERMINAR DATA DE ENROLLMENT
          // ─────────────────────────────────────────────────
          
          let enrolledAt = new Date()
          let dateSource = 'fallback'
          
          if (product.platform === 'hotmart') {
            if (user.hotmart?.purchaseDate) {
              enrolledAt = new Date(user.hotmart.purchaseDate)
              dateSource = 'purchaseDate'
            } else if (user.hotmart?.signupDate) {
              enrolledAt = new Date(user.hotmart.signupDate)
              dateSource = 'signupDate'
            } else if (user.hotmart?.firstAccessDate) {
              enrolledAt = new Date(user.hotmart.firstAccessDate)
              dateSource = 'firstAccessDate'
            }
          } else if (product.platform === 'curseduca') {
            if (user.curseduca?.joinedDate) {
              enrolledAt = new Date(user.curseduca.joinedDate)
              dateSource = 'joinedDate'
            } else if (user.curseduca?.enrolledClasses?.[0]?.enteredAt) {
              enrolledAt = new Date(user.curseduca.enrolledClasses[0].enteredAt)
              dateSource = 'enteredAt'
            }
          } else if (product.platform === 'discord') {
            if (user.discord?.createdAt) {
              enrolledAt = new Date(user.discord.createdAt)
              dateSource = 'discord.createdAt'
            }
          }
          
          // Fallback para metadata.createdAt
          if (dateSource === 'fallback' && user.metadata?.createdAt) {
            enrolledAt = new Date(user.metadata.createdAt)
            dateSource = 'metadata.createdAt'
          }
          
          // ─────────────────────────────────────────────────
          // DETERMINAR platformUserId
          // ─────────────────────────────────────────────────
          
          let platformUserId = 'unknown'
          
          if (product.platform === 'hotmart') {
            platformUserId = user.hotmart?.hotmartUserId || 'unknown'
          } else if (product.platform === 'curseduca') {
            platformUserId = user.curseduca?.curseducaUserId || 'unknown'
          } else if (product.platform === 'discord') {
            platformUserId = user.discord?.discordIds?.[0] || 'unknown'
          }
          
          // ─────────────────────────────────────────────────
          // CRIAR USERPRODUCT
          // ─────────────────────────────────────────────────
          
          await UserProduct.create({
            userId: user._id,
            productId: product._id,
            platform: product.platform,
            platformUserId,
            platformUserUuid: 
              product.platform === 'curseduca' ? user.curseduca?.curseducaUuid : undefined,
            enrolledAt,
            status: 'ACTIVE',
            source: 'MIGRATION',
            progress: {
              percentage: 
                product.platform === 'hotmart' ? (user.hotmart?.progress?.completedPercentage || 0) :
                product.platform === 'curseduca' ? (user.curseduca?.progress?.estimatedProgress || 0) :
                0
            },
            engagement: {
              engagementScore:
                product.platform === 'hotmart' ? (user.hotmart?.engagement?.engagementScore || 0) :
                product.platform === 'curseduca' ? (user.curseduca?.engagement?.alternativeEngagement || 0) :
                0
            },
            classes: [],
            metadata: {
              migrationDate: new Date(),
              dateSource,
              originalV1Data: true
            }
          })
          
          created++
          
          // Log de progresso a cada 100 users
          if (created % 100 === 0) {
            console.log(`   ⏳ Progresso: ${created}/${users.length} (${Math.round((created/users.length)*100)}%)`)
          }
          
        } catch (error: any) {
          if (error.code === 11000) {
            // Duplicate key - já existe
            skipped++
            continue
          }
          
          console.error(`   ❌ Erro ao processar user ${user._id}:`, error.message)
          errors++
        }
      }
      
      // Resumo do produto
      console.log(`\n   ✅ RESUMO ${product.code}:`)
      console.log(`      • Criados: ${created}`)
      console.log(`      • Pulados: ${skipped}`)
      if (errors > 0) {
        console.log(`      • Erros: ${errors}`)
      }
      
      totalCreated += created
      totalSkipped += skipped
      totalErrors += errors
      
      // Validar total final
      const finalCount = await UserProduct.countDocuments({ productId: product._id })
      console.log(`      • Total UserProducts agora: ${finalCount}`)
      
      const expectedTotal = existingCount + created
      if (finalCount !== expectedTotal) {
        console.log(`      ⚠️  ATENÇÃO: Esperado ${expectedTotal}, encontrado ${finalCount}`)
      }
    }
    
    // ─────────────────────────────────────────────────────────
    // RESUMO FINAL
    // ─────────────────────────────────────────────────────────
    
    console.log('\n════════════════════════════════════════════════════════════')
    console.log('📊 RESUMO GERAL DA MIGRAÇÃO')
    console.log('════════════════════════════════════════════════════════════\n')
    
    console.log(`✅ Total criados: ${totalCreated}`)
    console.log(`⏭️  Total pulados: ${totalSkipped}`)
    if (totalErrors > 0) {
      console.log(`❌ Total erros: ${totalErrors}`)
    }
    
    console.log('\n📦 USERPRODUCTS POR PRODUTO:\n')
    
    for (const product of products) {
      const count = await UserProduct.countDocuments({ productId: product._id })
      console.log(`   ${product.code}: ${count} UserProducts`)
    }
    
    const totalUserProducts = await UserProduct.countDocuments()
    console.log(`\n📊 TOTAL GERAL: ${totalUserProducts} UserProducts\n`)
    
    console.log('════════════════════════════════════════════════════════════')
    console.log('✅ MIGRAÇÃO COMPLETA!')
    console.log('════════════════════════════════════════════════════════════\n')
    
    console.log('🔄 PRÓXIMOS PASSOS:')
    console.log('   1. Fazer rebuild: POST /api/analytics/product-sales/rebuild')
    console.log('   2. Aguardar 60-90 segundos')
    console.log('   3. Recarregar frontend\n')
    
  } catch (error) {
    console.error('❌ Erro fatal na migração:', error)
  } finally {
    await mongoose.disconnect()
  }
}

migrateAllToUserProducts()