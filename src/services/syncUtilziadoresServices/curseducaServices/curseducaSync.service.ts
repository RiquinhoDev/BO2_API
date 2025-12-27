// ════════════════════════════════════════════════════════════
// 📁 src/services/sync/curseducaSync.service.ts
// CURSEDUCA SYNC SERVICE
// ════════════════════════════════════════════════════════════
//
// Serviço isolado para sincronização CursEduca
// Extraído do syncV2.controller.ts para separar concerns
//
// ════════════════════════════════════════════════════════════

import { Product, User } from "../../../models"
import logger from "../../../utils/logger"
import { dualWriteUserData } from "../../userProductService"



// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface CurseducaSyncData {
  email: string
  groupId: string
  name?: string
  progress?: number
  enrollmentDate?: string | Date
  lastAccess?: string | Date
}

interface SyncResult {
  success: boolean
  stats: {
    total: number
    inserted: number
    updated: number
    errors: number
  }
  errors?: string[]
}

// ═══════════════════════════════════════════════════════════
// MAIN SYNC FUNCTION
// ═══════════════════════════════════════════════════════════

/**
 * Sincronizar dados CursEduca
 * 
 * IMPORTANTE: Esta função faz sync de UM user por vez
 * Para batch sync, usar syncCurseducaBatch()
 * 
 * @param data - Dados do user CursEduca
 * @returns Resultado da sincronização
 */
export async function syncCursEduca(data: CurseducaSyncData): Promise<SyncResult> {
  logger.info('[CurseducaSync] Iniciando sync', { email: data.email, groupId: data.groupId })
  
  const result: SyncResult = {
    success: false,
    stats: {
      total: 1,
      inserted: 0,
      updated: 0,
      errors: 0
    },
    errors: []
  }
  
  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 1: VALIDAÇÃO
    // ═══════════════════════════════════════════════════════════
    
    if (!data.email || !data.groupId) {
      throw new Error('Missing required fields: email, groupId')
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 2: IDENTIFICAR PRODUTO
    // ═══════════════════════════════════════════════════════════
    
    const product = await Product.findOne({
      platform: 'curseduca',
      'platformData.groupId': data.groupId
    })
    
    if (!product) {
      throw new Error(`Produto CursEduca não encontrado para groupId: ${data.groupId}`)
    }
    
    logger.info('[CurseducaSync] Produto encontrado', {
      productId: product._id,
      productName: product.name
    })
    
    // ═══════════════════════════════════════════════════════════
    // STEP 3: BUSCAR OU CRIAR USER
    // ═══════════════════════════════════════════════════════════
    
    let user = await User.findOne({ email: data.email })
    let wasInserted = false
    
    if (!user) {
      logger.info('[CurseducaSync] Criando novo user', { email: data.email })
      
      user = await User.create({
        email: data.email,
        name: data.name || 'Unnamed User'
      })
      
      wasInserted = true
      result.stats.inserted++
    } else {
      logger.info('[CurseducaSync] User existente encontrado', { userId: user._id })
      result.stats.updated++
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 4: DUAL WRITE (V1 + V2)
    // ═══════════════════════════════════════════════════════════
    
    const productData = {
      progress: {
        percentage: data.progress || 0,
        enrollmentDate: data.enrollmentDate ? new Date(data.enrollmentDate) : new Date()
      },
      engagement: {
        lastActivityAt: data.lastAccess ? new Date(data.lastAccess) : new Date()
      }
    }
    
    await dualWriteUserData(
      user.id,
      product.code,
      productData
    )
    
    logger.info('[CurseducaSync] Dual write completo', {
      userId: user._id,
      productId: product._id,
      wasInserted
    })
    
    // ═══════════════════════════════════════════════════════════
    // STEP 5: SUCCESS
    // ═══════════════════════════════════════════════════════════
    
    result.success = true
    
    logger.info('[CurseducaSync] ✅ Sync completo', {
      email: data.email,
      wasInserted,
      stats: result.stats
    })
    
    return result
    
  } catch (error: any) {
    result.success = false
    result.stats.errors++
    result.errors = [error.message]
    
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

/**
 * Sincronizar múltiplos users CursEduca de uma vez
 * 
 * @param users - Array de dados de users
 * @param groupId - GroupId comum (ou passar em cada user)
 * @returns Resultado agregado
 */
export async function syncCurseducaBatch(
  users: CurseducaSyncData[],
  groupId?: string
): Promise<SyncResult> {
  logger.info('[CurseducaSync] Iniciando batch sync', { total: users.length })
  
  const result: SyncResult = {
    success: true,
    stats: {
      total: users.length,
      inserted: 0,
      updated: 0,
      errors: 0
    },
    errors: []
  }
  
  for (const userData of users) {
    // Se groupId comum foi passado, usar ele
    const data: CurseducaSyncData = groupId
      ? { ...userData, groupId }
      : userData
    
    try {
      const userResult = await syncCursEduca(data)
      
      result.stats.inserted += userResult.stats.inserted
      result.stats.updated += userResult.stats.updated
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
      result.errors?.push(`${userData.email}: ${error.message}`)
      
      logger.error('[CurseducaSync] Erro no batch', {
        email: userData.email,
        error: error.message
      })
    }
  }
  
  logger.info('[CurseducaSync] ✅ Batch sync completo', {
    stats: result.stats,
    successRate: `${((result.stats.total - result.stats.errors) / result.stats.total * 100).toFixed(1)}%`
  })
  
  return result
}

// ═══════════════════════════════════════════════════════════
// FULL SYNC (TODOS OS USERS DA PLATAFORMA)
// ═══════════════════════════════════════════════════════════

/**
 * Sincronizar TODOS os users de um produto CursEduca
 * 
 * NOTA: Esta função deve ser chamada pelo CRON diário
 * Assume que os dados vêm da API CursEduca
 * 
 * @param groupId - GroupId do produto
 * @returns Resultado agregado
 */
export async function syncCurseducaFull(groupId: string): Promise<SyncResult> {
  logger.info('[CurseducaSync] Iniciando full sync', { groupId })
  
  const result: SyncResult = {
    success: false,
    stats: {
      total: 0,
      inserted: 0,
      updated: 0,
      errors: 0
    },
    errors: []
  }
  
  try {
    // TODO: Integrar com API CursEduca real
    // const users = await curseducaAPI.getAllUsers(groupId)
    
    // MOCK temporário (remover quando integrar API real):
    logger.warn('[CurseducaSync] ⚠️ API CursEduca não integrada - usando MOCK')
    
    const mockUsers: CurseducaSyncData[] = [
      // Exemplo de estrutura esperada da API
      // { email: 'user1@example.com', name: 'User 1', progress: 50, ... }
    ]
    
    if (mockUsers.length === 0) {
      logger.warn('[CurseducaSync] Nenhum user retornado da API (MOCK vazio)')
      result.success = true
      return result
    }
    
    // Processar batch
    const batchResult = await syncCurseducaBatch(mockUsers, groupId)
    
    return batchResult
    
  } catch (error: any) {
    result.success = false
    result.errors = [error.message]
    
    logger.error('[CurseducaSync] ❌ Erro no full sync', {
      groupId,
      error: error.message,
      stack: error.stack
    })
    
    return result
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  syncCursEduca,
  syncCurseducaBatch,
  syncCurseducaFull
}