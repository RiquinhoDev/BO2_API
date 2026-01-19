// ══════════════════════════════════════════════════════════════════════
// 📁 src/services/snapshotServices/userSnapshot.service.ts
// Serviço principal para criar snapshots e registar histórico
// ══════════════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import UserSnapshot, { type IUserSnapshot, type IProductSnapshot } from '../../models/UserSnapshot'
import UserHistory from '../../models/UserHistory'
import type { IUser } from '../../models/user'
import type { IUserProduct } from '../../models/UserProduct'
import { compareSnapshots, type ComparisonResult } from './snapshotComparison.service'

// ═══════════════════════════════════════════════════════════════
// CREATE SNAPSHOT
// ═══════════════════════════════════════════════════════════════

/**
 * Cria snapshot do estado atual do utilizador
 */
export async function createUserSnapshot(
  user: IUser,
  products: IUserProduct[],
  syncType: 'hotmart' | 'curseduca' | 'discord' | 'manual',
  syncId?: mongoose.Types.ObjectId
): Promise<IUserSnapshot> {
  // Construir array de produtos
  const productSnapshots: IProductSnapshot[] = products.map((product) => {
    const productId = product.productId
    const productName = typeof productId === 'object' && productId !== null
      ? (productId as any).name || 'Produto desconhecido'
      : 'Produto desconhecido'

    return {
      productId: product.productId?.toString() || '',
      productName,
      platform: product.platform,
      status: product.status,
      enrolledAt: product.enrolledAt || null,

      // Progress
      progressPercentage: product.progress?.percentage || 0,
      completedLessons: product.progress?.completed,
      totalLessons: product.progress?.total,
      lastActivity: product.progress?.lastActivity || null,

      // Engagement
      engagementScore: product.engagement?.engagementScore,
      totalLogins: product.engagement?.totalLogins,
      lastLogin: product.engagement?.lastLogin || null,

      // Classes
      classes: product.classes?.map((cls) => ({
        classId: cls.classId,
        className: cls.className || `Turma ${cls.classId}`,
        role: cls.role,
        joinedAt: cls.joinedAt || null
      })),

      // Raw data (opcional - para debug)
      raw: {
        _id: product._id,
        isPrimary: product.isPrimary,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
      }
    }
  })

  // Calcular estatísticas
  const activeProducts = products.filter((p) => p.status === 'ACTIVE').length
  const inactiveProducts = products.length - activeProducts

  const platformCounts = {
    hotmart: products.filter((p) => p.platform === 'hotmart').length,
    curseduca: products.filter((p) => p.platform === 'curseduca').length,
    discord: products.filter((p) => p.platform === 'discord').length
  }

  const allClasses = products.flatMap((p) => p.classes || [])
  const activeClasses = products
    .filter((p) => p.status === 'ACTIVE')
    .flatMap((p) => p.classes || []).length

  // Criar snapshot
  const snapshot = new UserSnapshot({
    userId: user._id,
    userEmail: user.email,
    syncId,
    syncType,
    snapshotDate: new Date(),

    userState: {
      name: user.name,
      email: user.email,
      averageEngagement: user.averageEngagement,
      averageEngagementLevel: user.averageEngagementLevel,
      totalProducts: products.length,
      activePlatforms: Object.entries(platformCounts)
        .filter(([_, count]) => count > 0)
        .map(([platform]) => platform)
    },

    products: productSnapshots,

    stats: {
      totalProducts: products.length,
      activeProducts,
      inactiveProducts,
      totalClasses: allClasses.length,
      activeClasses,
      platformCounts
    }
  })

  await snapshot.save()
  return snapshot
}

// ═══════════════════════════════════════════════════════════════
// GET LAST SNAPSHOT
// ═══════════════════════════════════════════════════════════════

/**
 * Busca o último snapshot do utilizador (por tipo de sync)
 */
export async function getLastUserSnapshot(
  userId: mongoose.Types.ObjectId | string,
  syncType?: 'hotmart' | 'curseduca' | 'discord' | 'manual'
): Promise<IUserSnapshot | null> {
  const query: any = {
    userId: typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId
  }

  if (syncType) {
    query.syncType = syncType
  }

  return UserSnapshot.findOne(query)
    .sort({ snapshotDate: -1 })
    .lean()
}

// ═══════════════════════════════════════════════════════════════
// COMPARE AND RECORD
// ═══════════════════════════════════════════════════════════════

/**
 * Compara estado atual com último snapshot e regista diferenças no histórico
 */
export async function compareAndRecordChanges(
  user: IUser,
  products: IUserProduct[],
  syncType: 'hotmart' | 'curseduca' | 'discord' | 'manual',
  syncId?: mongoose.Types.ObjectId
): Promise<ComparisonResult> {
  // Buscar último snapshot
  const lastSnapshot = await getLastUserSnapshot(user._id, syncType)

  // Comparar
  const comparison = compareSnapshots(lastSnapshot, { user, products })

  // Se não houve alterações significativas, não registar
  if (!comparison.hasChanges) {
    console.log(`📋 [Snapshot] Sem alterações para ${user.email}`)
    return comparison
  }

  // ✅ Registar cada alteração no UserHistory
  const historyRecords = comparison.changes
    .filter((change) => change.changeType !== 'NO_CHANGES') // Excluir "NO_CHANGES"
    .map((change) => {
      // Mapear changeType para o enum do UserHistory
      let historyChangeType:
        | 'CLASS_CHANGE'
        | 'EMAIL_CHANGE'
        | 'MANUAL_EDIT'
        | 'PLATFORM_UPDATE'
        | 'STATUS_CHANGE'
        | 'INACTIVATION' = 'PLATFORM_UPDATE'

      if (change.changeType === 'EMAIL_CHANGE') {
        historyChangeType = 'EMAIL_CHANGE'
      } else if (
        change.changeType === 'CLASS_ADDED' ||
        change.changeType === 'CLASS_REMOVED' ||
        change.changeType === 'CLASS_ROLE_CHANGE'
      ) {
        historyChangeType = 'CLASS_CHANGE'
      } else if (change.changeType === 'PRODUCT_STATUS_CHANGE') {
        historyChangeType = 'STATUS_CHANGE'
      }

      return {
        userId: user._id,
        userEmail: user.email,
        changeType: historyChangeType,
        previousValue: { [change.field || 'value']: change.previousValue },
        newValue: { [change.field || 'value']: change.newValue },
        platform: change.platform || 'system',
        field: change.field,
        action: 'sync',
        changeDate: new Date(),
        source: syncType === 'hotmart' ? 'HOTMART_SYNC' : syncType === 'curseduca' ? 'CURSEDUCA_SYNC' : 'SYSTEM',
        syncId,
        metadata: {
          changeType: change.changeType,
          description: change.description,
          significance: change.significance,
          productId: change.productId,
          productName: change.productName,
          ...change.metadata
        }
      }
    })

  // Inserir em batch
  if (historyRecords.length > 0) {
    await UserHistory.insertMany(historyRecords)
    console.log(`✅ [Snapshot] ${historyRecords.length} alterações registadas para ${user.email}`)
  }

  return comparison
}

// ═══════════════════════════════════════════════════════════════
// SNAPSHOT WORKFLOW COMPLETO
// ═══════════════════════════════════════════════════════════════

/**
 * Workflow completo:
 * 1. Criar snapshot do estado atual
 * 2. Comparar com snapshot anterior
 * 3. Registar diferenças no histórico
 */
export async function snapshotAndCompare(
  user: IUser,
  products: IUserProduct[],
  syncType: 'hotmart' | 'curseduca' | 'discord' | 'manual',
  syncId?: mongoose.Types.ObjectId
): Promise<{
  snapshot: IUserSnapshot
  comparison: ComparisonResult
}> {
  // 1. Comparar e registar ANTES de criar novo snapshot
  const comparison = await compareAndRecordChanges(user, products, syncType, syncId)

  // 2. Criar novo snapshot
  const snapshot = await createUserSnapshot(user, products, syncType, syncId)

  return {
    snapshot,
    comparison
  }
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════

/**
 * Apagar snapshots expirados (mais antigos que X meses)
 */
export async function cleanupExpiredSnapshots(): Promise<number> {
  const result = await UserSnapshot.deleteMany({
    expiresAt: { $lt: new Date() }
  })

  return result.deletedCount || 0
}

/**
 * Listar snapshots de um utilizador
 */
export async function getUserSnapshots(
  userId: mongoose.Types.ObjectId | string,
  limit: number = 10
): Promise<IUserSnapshot[]> {
  return UserSnapshot.find({
    userId: typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId
  })
    .sort({ snapshotDate: -1 })
    .limit(limit)
    .lean()
}
