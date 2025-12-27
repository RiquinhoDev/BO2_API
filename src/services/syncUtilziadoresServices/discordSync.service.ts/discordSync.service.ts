// ════════════════════════════════════════════════════════════
// 📁 src/services/sync/discordSync.service.ts
// DISCORD SYNC SERVICE
// ════════════════════════════════════════════════════════════
//
// Serviço isolado para sincronização Discord
// Extraído do syncV2.controller.ts para separar concerns
//
// SITUAÇÃO ATUAL: CSV manual (Dyno)
// FUTURO: Login automático com validação OGI (ver BACKLOG.md)
//
// ════════════════════════════════════════════════════════════

import { Product, User } from "../../../models"
import logger from "../../../utils/logger"
import { dualWriteUserData } from "../../userProductService"



// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface DiscordSyncData {
  email: string
  discordId: string
  username: string
  serverId: string
  roles?: string[]
  lastSeen?: string | Date
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
 * Sincronizar dados Discord
 * 
 * IMPORTANTE: Esta função faz sync de UM user por vez
 * Para batch sync (CSV), usar syncDiscordBatch()
 * 
 * @param data - Dados do user Discord
 * @returns Resultado da sincronização
 */
export async function syncDiscord(data: DiscordSyncData): Promise<SyncResult> {
  logger.info('[DiscordSync] Iniciando sync', { email: data.email, discordId: data.discordId })
  
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
    
    if (!data.email || !data.discordId || !data.serverId) {
      throw new Error('Missing required fields: email, discordId, serverId')
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 2: IDENTIFICAR PRODUTO
    // ═══════════════════════════════════════════════════════════
    
    const product = await Product.findOne({
      platform: 'discord',
      'platformData.serverId': data.serverId
    })
    
    if (!product) {
      throw new Error(`Produto Discord não encontrado para serverId: ${data.serverId}`)
    }
    
    logger.info('[DiscordSync] Produto encontrado', {
      productId: product._id,
      productName: product.name
    })
    
    // ═══════════════════════════════════════════════════════════
    // STEP 3: BUSCAR OU CRIAR USER
    // ═══════════════════════════════════════════════════════════
    
    let user = await User.findOne({ email: data.email })
    let wasInserted = false
    
    if (!user) {
      logger.info('[DiscordSync] Criando novo user', { email: data.email })
      
      user = await User.create({
        email: data.email,
        name: data.username || 'Unnamed User'
      })
      
      wasInserted = true
      result.stats.inserted++
    } else {
      logger.info('[DiscordSync] User existente encontrado', { userId: user._id })
      result.stats.updated++
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 4: DUAL WRITE (V1 + V2)
    // ═══════════════════════════════════════════════════════════
    
    // NOTA IMPORTANTE SOBRE STATUS:
    // Discord NÃO usa campo 'status' no UserProduct
    // Status é controlado via CARGOS Discord (roles):
    // - User ativo: tem cargos do produto (ex: "OGI_V1")
    // - User inativo: cargo "inativo" adicionado, outros removidos
    // 
    // Quando aluno não renova (ex: OGI_V1), perde acesso à comunidade Discord:
    // - Backend atualiza cargos Discord via Bot
    // - Adiciona cargo "inativo"
    // - Remove todos os cargos de produtos ativos
    //
    // Esta lógica será implementada em:
    // - services/discord/manageRoles.service.ts (FUTURO)
    // - controllers/gerir-turmas (atualização de status)
    
    const productData = {
      platformUserId: data.discordId,
      engagement: {
        lastActivityAt: data.lastSeen ? new Date(data.lastSeen) : new Date()
      }
      // Discord-specific data (roles, username) serão geridos via Discord Bot
      // Ver BACKLOG.md - "Discord - Migração de CSV Manual para Login Automático"
    }
    
    await dualWriteUserData(
      user.id,
      product.code,
      productData
    )
    
    logger.info('[DiscordSync] Dual write completo', {
      userId: user._id,
      productId: product._id,
      wasInserted
    })
    
    // ═══════════════════════════════════════════════════════════
    // STEP 5: SUCCESS
    // ═══════════════════════════════════════════════════════════
    
    result.success = true
    
    logger.info('[DiscordSync] ✅ Sync completo', {
      email: data.email,
      wasInserted,
      stats: result.stats
    })
    
    return result
    
  } catch (error: any) {
    result.success = false
    result.stats.errors++
    result.errors = [error.message]
    
    logger.error('[DiscordSync] ❌ Erro no sync', {
      email: data.email,
      error: error.message,
      stack: error.stack
    })
    
    return result
  }
}

// ═══════════════════════════════════════════════════════════
// BATCH SYNC (CSV DYNO)
// ═══════════════════════════════════════════════════════════

/**
 * Sincronizar múltiplos users Discord de uma vez
 * 
 * NOTA: Atualmente usado para processar CSV do Dyno
 * 
 * @param users - Array de dados de users
 * @param serverId - ServerId comum (ou passar em cada user)
 * @returns Resultado agregado
 */
export async function syncDiscordBatch(
  users: DiscordSyncData[],
  serverId?: string
): Promise<SyncResult> {
  logger.info('[DiscordSync] Iniciando batch sync (CSV Dyno)', { total: users.length })
  
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
    // Se serverId comum foi passado, usar ele
    const data: DiscordSyncData = serverId
      ? { ...userData, serverId }
      : userData
    
    try {
      const userResult = await syncDiscord(data)
      
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
      
      logger.error('[DiscordSync] Erro no batch', {
        email: userData.email,
        error: error.message
      })
    }
  }
  
  logger.info('[DiscordSync] ✅ Batch sync completo', {
    stats: result.stats,
    successRate: `${((result.stats.total - result.stats.errors) / result.stats.total * 100).toFixed(1)}%`
  })
  
  return result
}

// ═══════════════════════════════════════════════════════════
// CSV SYNC (PROCESSO ATUAL)
// ═══════════════════════════════════════════════════════════

/**
 * Processar CSV do Dyno (processo manual atual)
 * 
 * @param csvData - Dados parseados do CSV
 * @param serverId - Server ID Discord
 * @returns Resultado do processamento
 */
export async function syncDiscordFromCSV(
  csvData: any[],
  serverId: string
): Promise<SyncResult> {
  logger.info('[DiscordSync] Processando CSV Dyno', {
    rows: csvData.length,
    serverId
  })
  
  // Transformar CSV para formato esperado
  const users: DiscordSyncData[] = csvData.map(row => ({
    email: row.email || row.Email || '',
    discordId: row.discordId || row.discord_id || row.id || '',
    username: row.username || row.Username || row.name || '',
    serverId,
    roles: row.roles ? row.roles.split(',') : [],
    lastSeen: row.lastSeen || row.last_seen || new Date()
  }))
  
  // Filtrar linhas inválidas
  const validUsers = users.filter(u => u.email && u.discordId)
  
  if (validUsers.length < users.length) {
    logger.warn('[DiscordSync] Algumas linhas do CSV foram ignoradas', {
      total: users.length,
      valid: validUsers.length,
      invalid: users.length - validUsers.length
    })
  }
  
  // Processar batch
  return await syncDiscordBatch(validUsers, serverId)
}

// ═══════════════════════════════════════════════════════════
// FUTURE: AUTO SYNC (DISCORD BOT)
// ═══════════════════════════════════════════════════════════

/**
 * Sincronizar via Discord Bot API (FUTURO)
 * 
 * TODO: Implementar quando Discord Bot estiver pronto
 * Ver BACKLOG.md - "Discord - Migração de CSV Manual para Login Automático"
 * 
 * @param serverId - Server ID Discord
 * @returns Resultado da sincronização
 */
export async function syncDiscordAuto(serverId: string): Promise<SyncResult> {
  logger.warn('[DiscordSync] ⚠️ Auto sync ainda não implementado')
  logger.info('[DiscordSync] Ver BACKLOG.md para roadmap de implementação')
  
  const result: SyncResult = {
    success: false,
    stats: {
      total: 0,
      inserted: 0,
      updated: 0,
      errors: 1
    },
    errors: ['Discord Bot API not implemented yet. Use CSV sync for now.']
  }
  
  return result
  
  // TODO: Implementar quando pronto:
  // const members = await discordBot.getServerMembers(serverId)
  // const users = await validateEligibility(members) // Validar OGI + email
  // return await syncDiscordBatch(users, serverId)
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  syncDiscord,
  syncDiscordBatch,
  syncDiscordFromCSV,
  syncDiscordAuto
}