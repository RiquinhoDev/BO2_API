// ════════════════════════════════════════════════════════════
// 📁 src/services/curseducaSyncV2.ts
// SINCRONIZAÇÃO CURSEDUCA COM DUAL WRITE (V2)
// ════════════════════════════════════════════════════════════

import User from '../models/user'
import Product from '../models/Product'
import UserProduct from '../models/UserProduct'

// ─────────────────────────────────────────────────────────────
// PROCESSAR USER CURSEDUCA COM DUAL WRITE
// ─────────────────────────────────────────────────────────────

export async function processCurseducaUserV2(curseducaUser: any) {
  // 1. Validações
  if (!curseducaUser.email?.trim()) {
    throw new Error('Email inválido')
  }
  
  if (!curseducaUser.name?.trim()) {
    throw new Error('Nome inválido')
  }
  
  const curseducaId = curseducaUser.id || curseducaUser.member_id
  const curseducaUuid = curseducaUser.uuid || curseducaUser.member_uuid
  
  if (!curseducaId && !curseducaUuid) {
    throw new Error('ID Curseduca inválido')
  }
  
  const normalizedEmail = curseducaUser.email.toLowerCase().trim()
  
  // 2. Buscar ou criar User
  let user = await User.findOne({ email: normalizedEmail })
  
  const isNewUser = !user
  
  if (!user) {
    user = await User.create({
      name: curseducaUser.name,
      email: normalizedEmail,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        sources: {}
      }
    })
  }
  
  // 3. Buscar produto CLAREZA-V1
  const product = await Product.findOne({ code: 'CLAREZA-V1' })
  
  if (!product) {
    throw new Error('Produto CLAREZA-V1 não encontrado!')
  }
  
  // 4. Preparar dados de progress
  const progressData = {
    percentage: curseducaUser.progress?.estimatedProgress || 0,
    lastActivity: new Date(),
    reportsGenerated: curseducaUser.reportsGenerated || 0,
    lastReportOpen: curseducaUser.lastReportOpen
  }
  
  // 5. Preparar dados de engagement (ACTION_BASED para Clareza)
  const engagementData = {
    engagementScore: curseducaUser.engagement?.alternativeEngagement || 0,
    lastAction: new Date(),
    daysSinceLastAction: 0,
    totalActions: curseducaUser.totalActions || 0,
    actionsLastWeek: curseducaUser.actionsLastWeek || 0,
    actionsLastMonth: curseducaUser.actionsLastMonth || 0,
    consistency: curseducaUser.engagement?.consistency || 0
  }
  
  // 6. Preparar classes (turmas Curseduca)
  const classes = []
  
  if (curseducaUser.enrolledClasses && Array.isArray(curseducaUser.enrolledClasses)) {
    classes.push(...curseducaUser.enrolledClasses.map((cls: any) => ({
      classId: cls.classId || cls.uuid,
      className: cls.className || cls.name,
      joinedAt: cls.enteredAt || new Date(),
      leftAt: cls.leftAt
    })))
  } else if (curseducaUser.groupId || curseducaUser.groupUuid) {
    // Se não tem enrolledClasses, usar groupId como classe principal
    classes.push({
      classId: curseducaUser.groupUuid || curseducaUser.groupId,
      className: curseducaUser.groupName || 'Turma Clareza',
      joinedAt: curseducaUser.joinedDate || new Date()
    })
  }
  
  // 7. ✅ DUAL WRITE: UserProduct (V2)
  const userProduct = await UserProduct.findOneAndUpdate(
    {
      userId: user._id,
      productId: product._id
    },
    {
      $set: {
        platform: 'curseduca',
        platformUserId: curseducaId,
        platformUserUuid: curseducaUuid,
        status: curseducaUser.memberStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        progress: progressData,
        engagement: engagementData,
        classes,
        'metadata.lastSyncAt': new Date()
      },
      $setOnInsert: {
        enrolledAt: curseducaUser.joinedDate || new Date(),
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
        'curseduca.curseducaUserId': curseducaId,
        'curseduca.curseducaUuid': curseducaUuid,
        'curseduca.groupId': curseducaUser.groupUuid || curseducaUser.groupId,
        'curseduca.groupName': curseducaUser.groupName,
        'curseduca.groupCurseducaId': curseducaUser.groupCurseducaId,
        'curseduca.groupCurseducaUuid': curseducaUser.groupUuid,
        'curseduca.memberStatus': curseducaUser.memberStatus || 'ACTIVE',
        'curseduca.neverLogged': curseducaUser.neverLogged || false,
        'curseduca.joinedDate': curseducaUser.joinedDate,
        'curseduca.enrolledClasses': classes.map(c => ({
          classId: c.classId,
          className: c.className,
          curseducaId: curseducaUser.groupCurseducaId,
          curseducaUuid: curseducaUser.groupUuid,
          enteredAt: c.joinedAt,
          expiresAt: c.leftAt,
          isActive: !c.leftAt,
          role: 'student'
        })),
        'curseduca.progress': {
          estimatedProgress: progressData.percentage,
          activityLevel: calculateActivityLevel(engagementData.engagementScore),
          groupEngagement: engagementData.engagementScore,
          progressSource: 'estimated'
        },
        'curseduca.engagement': {
          alternativeEngagement: engagementData.engagementScore,
          activityLevel: calculateActivityLevel(engagementData.engagementScore),
          engagementLevel: calculateEngagementLevel(engagementData.engagementScore),
          calculatedAt: new Date()
        },
        'curseduca.lastSyncAt': new Date(),
        'curseduca.syncVersion': '2.0'
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

function calculateActivityLevel(score: number): string {
  if (score >= 60) return 'HIGH'
  if (score >= 30) return 'MEDIUM'
  return 'LOW'
}

// ─────────────────────────────────────────────────────────────
// SINCRONIZAR BATCH DE USERS CURSEDUCA
// ─────────────────────────────────────────────────────────────

export async function syncCurseducaBatchV2(users: any[]) {
  const results = {
    total: users.length,
    processed: 0,
    created: 0,
    updated: 0,
    errors: 0,
    errorDetails: [] as string[]
  }
  
  for (const curseducaUser of users) {
    try {
      const result = await processCurseducaUserV2(curseducaUser)
      
      results.processed++
      if (result.isNewUser) {
        results.created++
      } else {
        results.updated++
      }
      
    } catch (error: any) {
      results.errors++
      results.errorDetails.push(
        `${curseducaUser.email || 'unknown'}: ${error.message}`
      )
      console.error(`❌ Erro ao processar ${curseducaUser.email}:`, error)
    }
  }
  
  return results
}

