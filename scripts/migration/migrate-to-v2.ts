// ════════════════════════════════════════════════════════════
// 📁 scripts/migration/migrate-to-v2.ts
// MIGRAÇÃO COMPLETA: V1 → V2
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../../src/models/user'
import Product from '../../src/models/Product'
import UserProduct from '../../src/models/UserProduct'
import { Class } from '../../src/models/Class'
import Course from '../../src/models/Course'

dotenv.config()

// ─────────────────────────────────────────────────────────────
// CONFIGURAÇÃO
// ─────────────────────────────────────────────────────────────

const DRY_RUN = process.env.DRY_RUN === 'true' || false
const BATCH_SIZE = 100

interface MigrationStats {
  usersProcessed: number
  userProductsCreated: number
  classesUpdated: number
  errors: Array<{ userId?: string, error: string }>
}

// ─────────────────────────────────────────────────────────────
// HELPER: CRIAR PRODUTOS PADRÃO
// ─────────────────────────────────────────────────────────────

async function createDefaultProducts() {
  console.log('📦 Criando produtos padrão...')
  
  // Buscar courses
  const ogiCourse = await Course.findOne({ code: 'OGI' })
  const clarezaCourse = await Course.findOne({ code: 'CLAREZA' })
  
  if (!ogiCourse || !clarezaCourse) {
    throw new Error('❌ Courses OGI ou CLAREZA não encontrados!')
  }
  
  const products = [
    {
      code: 'OGI-V1',
      name: 'O Grande Investimento V1',
      platform: 'hotmart' as const,
      courseId: ogiCourse._id,
      hotmartProductId: 'default-ogi-product',
      isActive: true,
      activeCampaignConfig: {
        tagPrefix: 'OGI',
        listId: ogiCourse.activeCampaignConfig.listId
      }
    },
    {
      code: 'CLAREZA-V1',
      name: 'Relatórios Clareza V1',
      platform: 'curseduca' as const,
      courseId: clarezaCourse._id,
      curseducaGroupId: 'default-clareza-group',
      isActive: true,
      activeCampaignConfig: {
        tagPrefix: 'CLAREZA',
        listId: clarezaCourse.activeCampaignConfig.listId
      }
    }
  ]
  
  for (const prodData of products) {
    const existing = await Product.findOne({ code: prodData.code })
    if (!existing) {
      if (!DRY_RUN) {
        await Product.create(prodData)
      }
      console.log(`✅ Produto criado: ${prodData.code}`)
    } else {
      console.log(`⏭️  Produto já existe: ${prodData.code}`)
    }
  }
  
  return {
    ogiProduct: await Product.findOne({ code: 'OGI-V1' }),
    clarezaProduct: await Product.findOne({ code: 'CLAREZA-V1' })
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: MIGRAR USER → USERPRODUCT
// ─────────────────────────────────────────────────────────────

async function migrateUser(user: any, products: any, stats: MigrationStats) {
  try {
    const userProducts: any[] = []
    
    // ═══════════════════════════════════════════════════════════
    // HOTMART
    // ═══════════════════════════════════════════════════════════
    
    if (user.hotmart?.hotmartUserId) {
      const hotmartUserId = user.hotmart.hotmartUserId
      
      userProducts.push({
        userId: user._id,
        productId: products.ogiProduct._id,
        platform: 'hotmart',
        platformUserId: hotmartUserId,
        enrolledAt: user.hotmart?.purchaseDate || user.hotmart?.signupDate || user.metadata?.createdAt || new Date(),
        status: user.combined?.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        source: 'MIGRATION',
        
        progress: {
          percentage: user.combined?.totalProgress || 0,
          currentModule: user.hotmart?.progress?.currentModule,
          modulesCompleted: [],
          lessonsCompleted: user.hotmart?.progress?.lessonsData?.filter((l: any) => l.completed).map((l: any) => l.lessonId) || [],
          lastActivity: user.hotmart?.progress?.lastAccessDate,
          videosWatched: user.hotmart?.progress?.completedLessons || 0,
          quizzesCompleted: 0
        },
        
        engagement: {
          engagementScore: user.hotmart?.engagement?.engagementScore || 0,
          lastLogin: user.hotmart?.progress?.lastAccessDate,
          daysSinceLastLogin: user.hotmart?.progress?.lastAccessDate 
            ? Math.floor((Date.now() - new Date(user.hotmart.progress.lastAccessDate).getTime()) / (1000 * 60 * 60 * 24))
            : undefined,
          totalLogins: user.hotmart?.engagement?.accessCount || 0,
          loginStreak: 0,
          consistency: user.hotmart?.engagement?.consistency
        },
        
        classes: (user.hotmart?.enrolledClasses || []).map((cls: any) => ({
          classId: cls.classId,
          className: cls.className,
          joinedAt: cls.enrolledAt || user.hotmart?.purchaseDate || new Date()
        })),
        
        activeCampaignData: {
          tags: [],
          lists: []
        }
      })
    }
    
    // ═══════════════════════════════════════════════════════════
    // CURSEDUCA
    // ═══════════════════════════════════════════════════════════
    
    if (user.curseduca?.curseducaUserId) {
      const curseducaUserId = user.curseduca.curseducaUserId
      const curseducaUuid = user.curseduca.curseducaUuid
      
      userProducts.push({
        userId: user._id,
        productId: products.clarezaProduct._id,
        platform: 'curseduca',
        platformUserId: curseducaUserId,
        platformUserUuid: curseducaUuid,
        enrolledAt: user.curseduca?.joinedDate || user.metadata?.createdAt || new Date(),
        status: user.curseduca?.memberStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        source: 'MIGRATION',
        
        progress: {
          percentage: user.curseduca?.progress?.estimatedProgress || 0,
          reportsGenerated: 0,
          lastReportOpen: undefined,
          lastActivity: user.curseduca?.lastSyncAt
        },
        
        engagement: {
          engagementScore: user.curseduca?.engagement?.alternativeEngagement || 0,
          lastAction: user.curseduca?.lastSyncAt,
          daysSinceLastAction: user.curseduca?.lastSyncAt
            ? Math.floor((Date.now() - new Date(user.curseduca.lastSyncAt).getTime()) / (1000 * 60 * 60 * 24))
            : undefined,
          totalActions: 0,
          actionsLastWeek: 0,
          actionsLastMonth: 0,
          consistency: user.curseduca?.engagement?.consistency
        },
        
        classes: (user.curseduca?.enrolledClasses || []).map((cls: any) => ({
          classId: cls.classId,
          className: cls.className,
          joinedAt: cls.enteredAt || user.curseduca?.joinedDate || new Date()
        })),
        
        activeCampaignData: {
          tags: [],
          lists: []
        }
      })
    }
    
    // ═══════════════════════════════════════════════════════════
    // DISCORD (se tiver)
    // ═══════════════════════════════════════════════════════════
    
    if (user.discord?.discordIds?.length) {
      const discordIds = user.discord.discordIds
      
      // Discord pode ter múltiplos IDs, usar o primeiro
      if (discordIds.length > 0) {
        // Só criar se já não tiver enrollment Hotmart
        const hasHotmart = userProducts.some(up => up.platform === 'hotmart')
        if (!hasHotmart) {
          userProducts.push({
            userId: user._id,
            productId: products.ogiProduct._id,
            platform: 'discord',
            platformUserId: discordIds[0],
            enrolledAt: user.discord?.createdAt || user.metadata?.createdAt || new Date(),
            status: user.discord?.isDeleted ? 'INACTIVE' : 'ACTIVE',
            source: 'MIGRATION',
            
            engagement: {
              engagementScore: 0
            },
            
            classes: [],
            
            activeCampaignData: {
              tags: [],
              lists: []
            }
          })
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // SALVAR USERPRODUCTS
    // ═══════════════════════════════════════════════════════════
    
    if (userProducts.length > 0) {
      if (!DRY_RUN) {
        for (const upData of userProducts) {
          // Verificar se já existe
          const existing = await UserProduct.findOne({
            userId: upData.userId,
            productId: upData.productId
          })
          
          if (!existing) {
            await UserProduct.create(upData)
            stats.userProductsCreated++
          }
        }
      } else {
        stats.userProductsCreated += userProducts.length
      }
    }
    
    stats.usersProcessed++
    
  } catch (error: any) {
    stats.errors.push({
      userId: user._id.toString(),
      error: error.message
    })
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: ATUALIZAR CLASSES COM PRODUCTID
// ─────────────────────────────────────────────────────────────

async function updateClasses(products: any, stats: MigrationStats) {
  console.log('\n📚 Atualizando turmas com productId...')
  
  const classes = await Class.find()
  
  for (const classDoc of classes) {
    try {
      // Determinar produto baseado na source
      let productId: any = null
      
      if (classDoc.source === 'hotmart_sync') {
        productId = products.ogiProduct._id
      } else if (classDoc.source === 'curseduca_sync' || classDoc.curseducaUuid) {
        productId = products.clarezaProduct._id
      } else {
        // Manual ou import - tentar inferir pelo nome
        if (classDoc.name.toLowerCase().includes('clareza')) {
          productId = products.clarezaProduct._id
        } else {
          productId = products.ogiProduct._id // Default
        }
      }
      
      if (!DRY_RUN) {
        await Class.updateOne(
          { _id: classDoc._id },
          { $set: { productId } }
        )
      }
      
      stats.classesUpdated++
      
    } catch (error: any) {
      stats.errors.push({
        error: `Class ${classDoc.classId}: ${error.message}`
      })
    }
  }
}

// ─────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL
// ─────────────────────────────────────────────────────────────

async function runMigration() {
  console.log('🚀 INICIANDO MIGRAÇÃO V1 → V2')
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (sem alterações)' : '✍️  LIVE (vai alterar DB)'}`)
  console.log('─'.repeat(60))
  
  const stats: MigrationStats = {
    usersProcessed: 0,
    userProductsCreated: 0,
    classesUpdated: 0,
    errors: []
  }
  
  try {
    // Conectar MongoDB
    await mongoose.connect(process.env.MONGO_URI || '')
    console.log('✅ Conectado ao MongoDB\n')
    
    // PASSO 1: Criar produtos padrão
    const products = await createDefaultProducts()
    
    if (!products.ogiProduct || !products.clarezaProduct) {
      throw new Error('❌ Produtos não foram criados corretamente!')
    }
    
    // PASSO 2: Migrar users em batches
    console.log('\n👥 Migrando users...')
    
    const totalUsers = await User.countDocuments({ 'discord.isDeleted': { $ne: true } })
    console.log(`Total users a processar: ${totalUsers}`)
    
    let skip = 0
    while (skip < totalUsers) {
      const users = await User.find({ 'discord.isDeleted': { $ne: true } })
        .skip(skip)
        .limit(BATCH_SIZE)
        .lean()
      
      for (const user of users) {
        await migrateUser(user, products, stats)
      }
      
      skip += BATCH_SIZE
      console.log(`Progresso: ${Math.min(skip, totalUsers)}/${totalUsers}`)
    }
    
    // PASSO 3: Atualizar classes
    await updateClasses(products, stats)
    
    // RELATÓRIO FINAL
    console.log('\n' + '═'.repeat(60))
    console.log('📊 RELATÓRIO DA MIGRAÇÃO')
    console.log('═'.repeat(60))
    console.log(`Users processados: ${stats.usersProcessed}`)
    console.log(`UserProducts criados: ${stats.userProductsCreated}`)
    console.log(`Classes atualizadas: ${stats.classesUpdated}`)
    console.log(`Erros: ${stats.errors.length}`)
    
    if (stats.errors.length > 0) {
      console.log('\n❌ ERROS:')
      stats.errors.slice(0, 10).forEach((err, idx) => {
        console.log(`${idx + 1}. ${err.userId || 'N/A'}: ${err.error}`)
      })
      if (stats.errors.length > 10) {
        console.log(`... e mais ${stats.errors.length - 10} erros`)
      }
    }
    
    console.log('\n✅ Migração concluída!')
    
  } catch (error: any) {
    console.error('❌ ERRO FATAL:', error.message)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
  }
}

// ─────────────────────────────────────────────────────────────
// EXECUTAR
// ─────────────────────────────────────────────────────────────

runMigration()

