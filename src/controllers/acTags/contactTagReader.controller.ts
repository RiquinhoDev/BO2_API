// ✅ SPRINT 5 - Task 5.1.2: Contact Tag Reader Controller
// Objetivo: Endpoints REST API para leitura e sincronização de tags AC → BO
import { Request, Response } from 'express'
import contactTagReaderService from '../../services/ac/contactTagReader.service'


// ═══════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════

/**
 * GET /api/ac/contact/:email/tags
 * Buscar tags de um contacto no Active Campaign
 * 
 * @param email Email do contacto
 * @returns ContactTagInfo com tags e produtos detectados
 */
export const getContactTags = async (req: Request, res: Response) => {
  try {
    const { email } = req.params
    
    console.log(`[ContactTagReader API] GET /api/ac/contact/${email}/tags`)
    
    const tags = await contactTagReaderService.getContactTags(email)
    
    if (!tags) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found in Active Campaign'
      })
    }
    
    res.json({
      success: true,
      data: tags
    })
  } catch (error: any) {
    console.error('[ContactTagReader API] Error in getContactTags:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * POST /api/ac/sync-user-tags/:userId
 * Sincronizar tags AC → BO para um user específico
 * 
 * @param userId ID do utilizador no BO
 * @returns SyncResult com número de produtos atualizados
 */
export const syncUserTags = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params
    
    console.log(`[ContactTagReader API] POST /api/ac/sync-user-tags/${userId}`)
    
    const result = await contactTagReaderService.syncUserTagsFromAC(userId)
    
    if (!result.synced) {
      return res.status(400).json({
        success: false,
        message: result.reason
      })
    }
    
    res.json({
      success: true,
      data: result
    })
  } catch (error: any) {
    console.error('[ContactTagReader API] Error in syncUserTags:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * POST /api/ac/sync-all-tags
 * Sincronizar TODOS os users (batch) AC → BO
 * 
 * @query limit Número máximo de users (default: 100)
 * @returns SyncSummary com estatísticas da sincronização
 * @requires Admin role
 */
export const syncAllTags = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100
    
    console.log(`[ContactTagReader API] POST /api/ac/sync-all-tags?limit=${limit}`)
    
    // TODO: Adicionar middleware isAdmin para proteger este endpoint
    
    const results = await contactTagReaderService.syncAllUsersFromAC(limit)
    
    res.json({
      success: true,
      data: results
    })
  } catch (error: any) {
    console.error('[ContactTagReader API] Error in syncAllTags:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * GET /api/ac/sync-status
 * Verificar status do sistema de sincronização
 * 
 * @returns Status e estatísticas gerais
 */
export const getSyncStatus = async (req: Request, res: Response) => {
  try {
    // Este endpoint pode retornar métricas como:
    // - Última sincronização
    // - Total de users sincronizados
    // - Taxa de sucesso
    // - etc.
    
    // Por agora, retornar status básico
    res.json({
      success: true,
      data: {
        message: 'Contact Tag Reader System Operational',
        lastSync: 'N/A', // TODO: Implementar tracking de última sync
        totalUsersSynced: 'N/A' // TODO: Implementar contador
      }
    })
  } catch (error: any) {
    console.error('[ContactTagReader API] Error in getSyncStatus:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
