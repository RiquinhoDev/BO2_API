// ════════════════════════════════════════════════════════════
// 📁 src/services/sync/hotmartSync.service.ts
// HOTMART SYNC SERVICE
// ════════════════════════════════════════════════════════════
//
// Serviço isolado para sincronização Hotmart
// Extraído do syncV2.controller.ts para separar concerns
//
// ════════════════════════════════════════════════════════════

import { Product, User } from "../../../models"
import logger from "../../../utils/logger"
import { dualWriteUserData } from "../../userProductService"



// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface HotmartSyncData {
  email: string
  subdomain: string
  name?: string
  status?: string
  progress?: number
  lastAccess?: string | Date
  classes?: any[]
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
 * Sincronizar dados Hotmart
 * 
 * IMPORTANTE: Esta função faz sync de UM user por vez
 * Para batch sync, usar syncHotmartBatch()
 * 
 * @param data - Dados do user Hotmart
 * @returns Resultado da sincronização
 */
export async function syncHotmart(data: HotmartSyncData): Promise<SyncResult> {
  logger.info('[HotmartSync] Iniciando sync', { email: data.email, subdomain: data.subdomain })
  
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
    
    if (!data.email || !data.subdomain) {
      throw new Error('Missing required fields: email, subdomain')
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 2: IDENTIFICAR PRODUTO
    // ═══════════════════════════════════════════════════════════
    
    const product = await Product.findOne({
      platform: 'hotmart',
      'platformData.subdomain': data.subdomain
    })
    
    if (!product) {
      throw new Error(`Produto Hotmart não encontrado para subdomain: ${data.subdomain}`)
    }
    
    logger.info('[HotmartSync] Produto encontrado', {
      productId: product._id,
      productName: product.name
    })
    
    // ═══════════════════════════════════════════════════════════
    // STEP 3: BUSCAR OU CRIAR USER
    // ═══════════════════════════════════════════════════════════
    
    let user = await User.findOne({ email: data.email })
    let wasInserted = false
    
    if (!user) {
      logger.info('[HotmartSync] Criando novo user', { email: data.email })
      
      user = await User.create({
        email: data.email,
        name: data.name || 'Unnamed User'
      })
      
      wasInserted = true
      result.stats.inserted++
    } else {
      logger.info('[HotmartSync] User existente encontrado', { userId: user._id })
      result.stats.updated++
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 4: DUAL WRITE (V1 + V2)
    // ═══════════════════════════════════════════════════════════
    
    // Validar status (garantir que é um dos valores aceites)
    const validStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CANCELLED']
    const status = validStatuses.includes(data.status || '') 
      ? (data.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'CANCELLED')
      : 'ACTIVE' as const
    
    const productData = {
      status,
      progress: {
        percentage: data.progress || 0,
        classes: data.classes || []
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
    
    logger.info('[HotmartSync] Dual write completo', {
      userId: user._id,
      productId: product._id,
      wasInserted
    })
    
    // ═══════════════════════════════════════════════════════════
    // STEP 5: SUCCESS
    // ═══════════════════════════════════════════════════════════
    
    result.success = true
    
    logger.info('[HotmartSync] ✅ Sync completo', {
      email: data.email,
      wasInserted,
      stats: result.stats
    })
    
    return result
    
  } catch (error: any) {
    result.success = false
    result.stats.errors++
    result.errors = [error.message]
    
    logger.error('[HotmartSync] ❌ Erro no sync', {
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
 * Sincronizar múltiplos users Hotmart de uma vez
 * 
 * @param users - Array de dados de users
 * @param subdomain - Subdomain comum (ou passar em cada user)
 * @returns Resultado agregado
 */
export async function syncHotmartBatch(
  users: HotmartSyncData[],
  subdomain?: string
): Promise<SyncResult> {
  logger.info('[HotmartSync] Iniciando batch sync', { total: users.length })
  
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
    // Se subdomain comum foi passado, usar ele
    const data: HotmartSyncData = subdomain
      ? { ...userData, subdomain }
      : userData
    
    try {
      const userResult = await syncHotmart(data)
      
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
      
      logger.error('[HotmartSync] Erro no batch', {
        email: userData.email,
        error: error.message
      })
    }
  }
  
  logger.info('[HotmartSync] ✅ Batch sync completo', {
    stats: result.stats,
    successRate: `${((result.stats.total - result.stats.errors) / result.stats.total * 100).toFixed(1)}%`
  })
  
  return result
}

// ═══════════════════════════════════════════════════════════
// FULL SYNC (TODOS OS USERS DA PLATAFORMA)
// ═══════════════════════════════════════════════════════════

/**
 * Sincronizar TODOS os users de um produto Hotmart
 * 
 * NOTA: Esta função deve ser chamada pelo CRON diário
 * Assume que os dados vêm da API Hotmart
 * 
 * @param subdomain - Subdomain do produto
 * @returns Resultado agregado
 */
export async function syncHotmartFull(subdomain: string): Promise<SyncResult> {
  logger.info('[HotmartSync] Iniciando full sync', { subdomain })
  
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
    // TODO: Integrar com API Hotmart real
    // const users = await hotmartAPI.getAllUsers(subdomain)
    
    // MOCK temporário (remover quando integrar API real):
    logger.warn('[HotmartSync] ⚠️ API Hotmart não integrada - usando MOCK')
    
    const mockUsers: HotmartSyncData[] = [
      // Exemplo de estrutura esperada da API
      // { email: 'user1@example.com', name: 'User 1', progress: 75, ... }
    ]
    
    if (mockUsers.length === 0) {
      logger.warn('[HotmartSync] Nenhum user retornado da API (MOCK vazio)')
      result.success = true
      return result
    }
    
    // Processar batch
    const batchResult = await syncHotmartBatch(mockUsers, subdomain)
    
    return batchResult
    
  } catch (error: any) {
    result.success = false
    result.errors = [error.message]
    
    logger.error('[HotmartSync] ❌ Erro no full sync', {
      subdomain,
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
  syncHotmart,
  syncHotmartBatch,
  syncHotmartFull
}