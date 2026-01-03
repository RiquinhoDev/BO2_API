// ════════════════════════════════════════════════════════════
// 📁 curseducaSync.service.ts - VERSÃO CORRIGIDA
// ════════════════════════════════════════════════════════════

import { Product, User } from '../../../models'
import { CurseducaSyncData, SyncResult } from '../../../types/curseduca.types'
import { UniversalSourceItem } from '../../../types/universalSync.types'
import logger from '../../../utils/logger'
import { dualWriteUserData } from '../../userProducts/userProductService'
import curseducaAdapter from './curseduca.adapter'

// ✅ CORRIGIDO: Importar do ficheiro certo


// ═══════════════════════════════════════════════════════════
// HELPER: SAFE DATE
// ═══════════════════════════════════════════════════════════

function safeDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }
  return new Date()
}

// ═══════════════════════════════════════════════════════════
// SINGLE USER SYNC
// ═══════════════════════════════════════════════════════════

export async function syncCursEduca(data: CurseducaSyncData): Promise<SyncResult> {
  logger.info('[CurseducaSync] Iniciando sync', { email: data.email, groupId: data.groupId })

  const result: SyncResult = {
    success: false,
    stats: {
      total: 1,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    },
    errors: []
  }

  try {
    // Validação
    if (!data.email || !data.groupId) {
      throw new Error('Missing required fields: email, groupId')
    }

    // Identificar produto
    const product = await Product.findOne({
      platform: 'curseduca',
      $or: [
        { 'platformData.groupId': data.groupId },
        { curseducaGroupId: data.groupId }
      ]
    })

    if (!product) {
      throw new Error(`Produto CursEduca não encontrado para groupId: ${data.groupId}`)
    }

    logger.info('[CurseducaSync] Produto encontrado', {
      productId: product._id,
      productName: product.name
    })

    // Buscar ou criar user
    let user = await User.findOne({ email: data.email })
    const isNewUser = !user

    if (!user) {
      logger.info('[CurseducaSync] Criando novo user', { email: data.email })

      user = await User.create({
        email: data.email,
        name: data.name || 'Unnamed User'
      })

      result.stats.created++
    } else {
      logger.info('[CurseducaSync] User existente encontrado', { userId: user._id })
      result.stats.updated++
    }

    // Atualizar campos CursEduca no User (V1)
    const updateFields: Record<string, any> = {}

    // IDs
    if (data.curseducaUserId) {
      updateFields['curseduca.curseducaUserId'] = data.curseducaUserId
    }

    if (data.curseducaUuid) {
      updateFields['curseduca.curseducaUuid'] = data.curseducaUuid
    }

    // 🆕 enrollmentsCount
    if (data.enrollmentsCount !== undefined) {
      updateFields['curseduca.enrollmentsCount'] = data.enrollmentsCount
    }

    // Grupo
    if (data.groupId) {
      updateFields['curseduca.groupId'] = data.groupId
    }

    // 🆕 Subscrição
    if (data.subscriptionType) {
      updateFields['curseduca.subscriptionType'] = data.subscriptionType
    }

    // 🆕 Situation
    if (data.situation) {
      updateFields['curseduca.situation'] = data.situation
    }

    // Datas
    if (data.enrollmentDate) {
      updateFields['curseduca.joinedDate'] = safeDate(data.enrollmentDate)
    }

    // 🆕 lastLogin
    if (data.lastLogin) {
      updateFields['curseduca.lastLogin'] = safeDate(data.lastLogin)
    }

    // lastAccess (retrocompatibilidade)
    if (data.lastAccess) {
      updateFields['curseduca.lastAccess'] = safeDate(data.lastAccess)
    }

    // Progresso
    if (data.progress !== undefined) {
      updateFields['curseduca.progress.estimatedProgress'] = data.progress
    }

    // Engagement
    if (data.progress !== undefined) {
      const engagementScore = Math.min(100, data.progress * 2)
      updateFields['curseduca.engagement.alternativeEngagement'] = engagementScore
      
      let engagementLevel: string
      if (engagementScore >= 80) engagementLevel = 'MUITO_ALTO'
      else if (engagementScore >= 60) engagementLevel = 'ALTO'
      else if (engagementScore >= 40) engagementLevel = 'MEDIO'
      else if (engagementScore >= 25) engagementLevel = 'BAIXO'
      else engagementLevel = 'MUITO_BAIXO'
      
      updateFields['curseduca.engagement.engagementLevel'] = engagementLevel
      updateFields['curseduca.engagement.calculatedAt'] = new Date()
    }

    // Metadados de sync
    updateFields['curseduca.lastSyncAt'] = new Date()
    updateFields['curseduca.syncVersion'] = '3.1'
    updateFields['metadata.updatedAt'] = new Date()
    updateFields['metadata.sources.curseduca.lastSync'] = new Date()
    updateFields['metadata.sources.curseduca.version'] = '3.1'

    // Aplicar updates
    if (Object.keys(updateFields).length > 0) {
      await User.findByIdAndUpdate(user._id, { $set: updateFields })
      logger.info('[CurseducaSync] User V1 atualizado', { 
        userId: user._id,
        fieldsUpdated: Object.keys(updateFields).length 
      })
    }

    // Dual write (V2 - UserProduct)
    const productData = {
      progress: {
        percentage: data.progress || 0,
        enrollmentDate: data.enrollmentDate ? safeDate(data.enrollmentDate) : new Date()
      },
      engagement: {
        lastActivityAt: data.lastAccess ? safeDate(data.lastAccess) : new Date(),
        lastLogin: data.lastLogin ? safeDate(data.lastLogin) : undefined
      },
      isPrimary: data.isPrimary !== undefined ? data.isPrimary : true,
      metadata: {
        situation: data.situation,
        enrollmentsCount: data.enrollmentsCount
      }
    }

    await dualWriteUserData(user.id, product.code, productData)

    logger.info('[CurseducaSync] Dual write completo', {
      userId: user._id,
      productId: product._id,
      isPrimary: data.isPrimary
    })

    result.success = true

    logger.info('[CurseducaSync] ✅ Sync completo', {
      email: data.email,
      isNew: isNewUser,
      stats: result.stats
    })

    return result
    
  } catch (error: any) {
    result.success = false
    result.stats.errors++
    result.errors = [{ email: data.email, error: error.message }]

    logger.error('[CurseducaSync] ❌ Erro no sync', {
      email: data.email,
      error: error.message,
      stack: error.stack
    })

    return result
  }
}

// ═══════════════════════════════════════════════════════════
// BATCH SYNC
// ═══════════════════════════════════════════════════════════

export async function syncCurseducaBatch(
  users: CurseducaSyncData[],
  groupId?: string
): Promise<SyncResult> {
  logger.info('[CurseducaSync] Iniciando batch sync', { total: users.length })

  const result: SyncResult = {
    success: true,
    stats: {
      total: users.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    },
    errors: []
  }

  for (const userData of users) {
    const data: CurseducaSyncData = groupId ? { ...userData, groupId } : userData

    try {
      const userResult = await syncCursEduca(data)

      result.stats.created += userResult.stats.created
      result.stats.updated += userResult.stats.updated
      result.stats.skipped += userResult.stats.skipped
      result.stats.errors += userResult.stats.errors

      if (!userResult.success) {
        result.success = false
        if (userResult.errors) {
          result.errors?.push(...userResult.errors)
        }
      }
    } catch (error: any) {
      result.success = false
      result.stats.errors++
      result.errors?.push({
        email: userData.email || 'unknown',
        error: error.message
      })

      logger.error('[CurseducaSync] Erro no batch', {
        email: userData.email,
        error: error.message
      })
    }
  }

  logger.info('[CurseducaSync] ✅ Batch sync completo', {
    stats: result.stats,
    successRate: `${(((result.stats.total - result.stats.errors) / result.stats.total) * 100).toFixed(1)}%`
  })

  return result
}

// ═══════════════════════════════════════════════════════════
// FULL SYNC (INTEGRADO COM ADAPTER)
// ═══════════════════════════════════════════════════════════

export async function syncCurseducaFull(
  groupId?: string,
  enrichWithDetails: boolean = true
): Promise<SyncResult> {
  logger.info('[CurseducaSync] Iniciando full sync', { 
    groupId: groupId || 'TODOS',
    enrichWithDetails 
  })

  const result: SyncResult = {
    success: false,
    stats: {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    },
    errors: []
  }

  try {
    // Validar credenciais
    if (!process.env.CURSEDUCA_API_URL || 
        !process.env.CURSEDUCA_AccessToken || 
        !process.env.CURSEDUCA_API_KEY) {
      throw new Error('Credenciais CursEduca não configuradas (.env)')
    }

    // Buscar dados via adapter
    logger.info('[CurseducaSync] 🚀 Buscando dados via curseduca.adapter...')

    // ✅ CORRIGIDO: Retorna UniversalSourceItem[]
    const adapterData: UniversalSourceItem[] = await curseducaAdapter.fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: true,
      groupId: groupId,
      enrichWithDetails: enrichWithDetails
    })

    if (adapterData.length === 0) {
      logger.warn('[CurseducaSync] ⚠️ Adapter retornou 0 users')
      result.success = true
      return result
    }

    logger.info(`[CurseducaSync] ✅ Adapter retornou ${adapterData.length} users`)

    // Converter dados do adapter para formato do sync
    const usersToSync: CurseducaSyncData[] = adapterData.map((user) => ({
      email: user.email || '',  // ✅ Garantir string
      groupId: user.groupId?.toString() || '',
      name: user.name || user.email || 'Unknown',  // ✅ Fallback
      
      // IDs
      curseducaUserId: user.curseducaUserId,
      curseducaUuid: user.curseducaUuid,
      
      // Progresso
      progress: user.progress?.percentage || 0,
      
      // Datas
      enrollmentDate: user.enrolledAt 
        ? safeDate(user.enrolledAt)
        : new Date(),
      
      lastAccess: user.lastAccess 
        ? safeDate(user.lastAccess)
        : undefined,
      
      // 🆕 lastLogin
      lastLogin: user.lastLogin 
        ? safeDate(user.lastLogin)
        : undefined,
      
      // 🆕 Status detalhado
      situation: user.platformData?.situation || 'ACTIVE',
      
      // 🆕 enrollmentsCount
      enrollmentsCount: user.platformData?.enrollmentsCount || 0,
      
      // Subscrição
      subscriptionType: user.subscriptionType,
      
      // Deduplicação
      isPrimary: user.platformData?.isPrimary
    }))

    logger.info(`[CurseducaSync] 📦 Convertidos ${usersToSync.length} users para sync`)

    // Processar batch
    const batchResult = await syncCurseducaBatch(usersToSync)

    logger.info('[CurseducaSync] ✅ Full sync completo', {
      stats: batchResult.stats
    })

    return batchResult
    
  } catch (error: any) {
    result.success = false
    result.errors = [{ email: 'SYSTEM', error: error.message }]

    logger.error('[CurseducaSync] ❌ Erro no full sync', {
      groupId,
      error: error.message,
      stack: error.stack
    })

    return result
  }
}

// ═══════════════════════════════════════════════════════════
// 🆕 SYNC MANUAL DE UM USER ESPECÍFICO
// ═══════════════════════════════════════════════════════════

export async function syncCurseducaByEmail(
  email: string,
  groupId?: string
): Promise<SyncResult> {
  logger.info('[CurseducaSync] Iniciando sync manual por email', { email, groupId })

  try {
    // ✅ CORRIGIDO: Retorna UniversalSourceItem[]
    const adapterData: UniversalSourceItem[] = await curseducaAdapter.fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: true,
      groupId: groupId,
      enrichWithDetails: true
    })

    // Filtrar por email
    const userData = adapterData.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (!userData) {
      return {
        success: false,
        stats: { total: 0, created: 0, updated: 0, skipped: 1, errors: 0 },
        errors: [{ email, error: 'User não encontrado na API CursEduca' }]
      }
    }

    // Converter e sincronizar
    const syncData: CurseducaSyncData = {
      email: userData.email || email,  // ✅ Garantir string
      groupId: userData.groupId?.toString() || '',
      name: userData.name || email,
      curseducaUserId: userData.curseducaUserId,
      curseducaUuid: userData.curseducaUuid,
      progress: userData.progress?.percentage || 0,
      enrollmentDate: userData.enrolledAt ? safeDate(userData.enrolledAt) : new Date(),
      lastAccess: userData.lastAccess ? safeDate(userData.lastAccess) : undefined,
      lastLogin: userData.lastLogin ? safeDate(userData.lastLogin) : undefined,
      situation: userData.platformData?.situation,
      enrollmentsCount: userData.platformData?.enrollmentsCount,
      subscriptionType: userData.subscriptionType,
      isPrimary: userData.platformData?.isPrimary
    }

    return await syncCursEduca(syncData)
    
  } catch (error: any) {
    return {
      success: false,
      stats: { total: 1, created: 0, updated: 0, skipped: 0, errors: 1 },
      errors: [{ email, error: error.message }]
    }
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

export default {
  syncCursEduca,
  syncCurseducaBatch,
  syncCurseducaFull,
  syncCurseducaByEmail
}