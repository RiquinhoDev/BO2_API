// ════════════════════════════════════════════════════════════
// 📁 src/services/hotmartSyncV2.ts
// SINCRONIZAÇÃO HOTMART COM DUAL WRITE (V2)
// ════════════════════════════════════════════════════════════

import User from '../models/user'
import Product from '../models/Product'
import UserProduct from '../models/UserProduct'
import { dualWriteUserData } from './userProductService'

// ─────────────────────────────────────────────────────────────
// PROCESSAR USER HOTMART COM DUAL WRITE
// ─────────────────────────────────────────────────────────────

export async function processHotmartUserV2(hotmartUser: any) {
  // 1. Validações
  if (!hotmartUser.email?.trim()) {
    throw new Error('Email inválido')
  }
  
  if (!hotmartUser.name?.trim()) {
    throw new Error('Nome inválido')
  }
  
  const hotmartId = hotmartUser.id || hotmartUser.user_id || hotmartUser.uid
  if (!hotmartId) {
    throw new Error('ID Hotmart inválido')
  }
  
  const normalizedEmail = hotmartUser.email.toLowerCase().trim()
  
  // 2. Buscar ou criar User
  let user = await User.findOne({ email: normalizedEmail })
  
  const isNewUser = !user
  
  if (!user) {
    user = await User.create({
      name: hotmartUser.name,
      email: normalizedEmail,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        sources: {}
      }
    })
  }
  
  // 3. Buscar produto OGI-V1
  const product = await Product.findOne({ code: 'OGI-V1' })
  
  if (!product) {
    throw new Error('Produto OGI-V1 não encontrado!')
  }
  
  // 4. Preparar dados de progress
  const progressData = {
    percentage: hotmartUser.progressData?.completedPercentage || 0,
    currentModule: hotmartUser.progressData?.currentModule,
    modulesCompleted: hotmartUser.progressData?.modulesCompleted || [],
    lessonsCompleted: hotmartUser.progressData?.lessons
      ?.filter((l: any) => l.isCompleted)
      .map((l: any) => l.pageId) || [],
    lastActivity: new Date(),
    videosWatched: hotmartUser.progressData?.completed || 0,
    quizzesCompleted: 0
  }
  
  // 5. Preparar dados de engagement
  const engagementData = {
    engagementScore: hotmartUser.engagementData?.engagementScore || 0,
    lastLogin: new Date(),
    daysSinceLastLogin: 0,
    totalLogins: hotmartUser.accessCount || 0,
    loginStreak: 0,
    consistency: hotmartUser.engagementData?.consistency || 0
  }
  
  // 6. Preparar classes
  const classes = hotmartUser.class_id ? [{
    classId: hotmartUser.class_id,
    className: hotmartUser.class_name || hotmartUser.class_id,
    joinedAt: hotmartUser.enrolledAt || new Date()
  }] : []
  
  // 7. ✅ DUAL WRITE: UserProduct (V2)
  const userProduct = await UserProduct.findOneAndUpdate(
    {
      userId: user._id,
      productId: product._id
    },
    {
      $set: {
        platform: 'hotmart',
        platformUserId: hotmartId,
        status: 'ACTIVE',
        progress: progressData,
        engagement: engagementData,
        classes,
        'metadata.lastSyncAt': new Date()
      },
      $setOnInsert: {
        enrolledAt: hotmartUser.purchaseDate || hotmartUser.signupDate || new Date(),
        source: 'PURCHASE'
      }
    },
    { upsert: true, new: true }
  )
  
  // 8. ✅ DUAL WRITE: User (V1 - backward compatibility)
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        'hotmart.hotmartUserId': hotmartId,
        'hotmart.purchaseDate': hotmartUser.purchaseDate,
        'hotmart.signupDate': hotmartUser.signupDate,
        'hotmart.plusAccess': hotmartUser.plusAccess || 'WITHOUT_PLUS_ACCESS',
        'hotmart.firstAccessDate': hotmartUser.firstAccessDate,
        'hotmart.enrolledClasses': classes.map(c => ({
          classId: c.classId,
          className: c.className,
          source: 'hotmart',
          isActive: true,
          enrolledAt: c.joinedAt
        })),
        'hotmart.progress': {
          totalTimeMinutes: hotmartUser.progressData?.totalTimeMinutes || 0,
          completedLessons: hotmartUser.progressData?.completed || 0,
          lessonsData: hotmartUser.progressData?.lessons || [],
          lastAccessDate: new Date()
        },
        'hotmart.engagement': {
          accessCount: hotmartUser.accessCount || 0,
          engagementScore: engagementData.engagementScore,
          engagementLevel: calculateEngagementLevel(engagementData.engagementScore),
          calculatedAt: new Date()
        },
        'hotmart.lastSyncAt': new Date(),
        'hotmart.syncVersion': '2.0'
      }
    }
  )
  
  // 9. Recalcular combined data
  if (user.calculateCombinedData) {
    await user.calculateCombinedData()
    await user.save()
  }
  
  return {
    user,
    userProduct,
    isNewUser
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: CALCULAR ENGAGEMENT LEVEL
// ─────────────────────────────────────────────────────────────

function calculateEngagementLevel(score: number): string {
  if (score >= 80) return 'MUITO_ALTO'
  if (score >= 60) return 'ALTO'
  if (score >= 40) return 'MEDIO'
  if (score >= 25) return 'BAIXO'
  return 'MUITO_BAIXO'
}

// ─────────────────────────────────────────────────────────────
// SINCRONIZAR BATCH DE USERS HOTMART
// ─────────────────────────────────────────────────────────────

export async function syncHotmartBatchV2(users: any[]) {
  const results = {
    total: users.length,
    processed: 0,
    created: 0,
    updated: 0,
    errors: 0,
    errorDetails: [] as string[]
  }
  
  for (const hotmartUser of users) {
    try {
      const result = await processHotmartUserV2(hotmartUser)
      
      results.processed++
      if (result.isNewUser) {
        results.created++
      } else {
        results.updated++
      }
      
    } catch (error: any) {
      results.errors++
      results.errorDetails.push(
        `${hotmartUser.email || 'unknown'}: ${error.message}`
      )
      console.error(`❌ Erro ao processar ${hotmartUser.email}:`, error)
    }
  }
  
  return results
}

