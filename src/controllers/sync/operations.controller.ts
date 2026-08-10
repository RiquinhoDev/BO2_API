import { NextFunction, Request, Response } from 'express'
import { executeDailyPipeline } from '../../services/cron/dailyPipeline.service'
import universalSyncService from '../../services/syncUtilizadoresServices/universalSync'
import hotmartAdapter from '../../services/syncUtilizadoresServices/hotmartServices/hotmart.adapter'
import curseducaAdapter from '../../services/syncUtilizadoresServices/curseducaServices/curseduca.adapter'
import { IntegrationUnavailableError } from '../../errors/integrationUnavailableError'
import { internalError } from '../../security/errorHandling'
import type { SyncExecutePipelineInput } from '../../security/syncDestructiveInput'

function forwardSyncFailure(
  error: unknown,
  next: NextFunction,
  publicMessage: string,
  code: string,
): void {
  if (error instanceof IntegrationUnavailableError) {
    next(error)
    return
  }
  next(internalError(publicMessage, code, error))
}
/**
 * POST /api/sync/execute-pipeline
 * Executar pipeline diário completo
 */
export const executePipeline = async (
  _input: SyncExecutePipelineInput,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await executeDailyPipeline()
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Pipeline executado com sucesso',
        duration: result.duration,
        summary: result.summary,
        steps: result.steps
      })
    } else {
      const cause = new Error(JSON.stringify({
        duration: result.duration,
        errorCount: result.errors.length,
        steps: Object.entries(result.steps).map(([name, step]) => ({
          name,
          success: step.success,
          duration: step.duration,
        })),
      }))
      next(internalError(
        'Pipeline executado com erros',
        'SYNC_PIPELINE_COMPLETED_WITH_ERRORS',
        cause,
      ))
    }
  } catch (error: unknown) {
    forwardSyncFailure(
      error,
      next,
      'Erro fatal ao executar pipeline',
      'SYNC_PIPELINE_EXECUTION_FAILED',
    )
  }
}

// ═══════════════════════════════════════════════════════════
// HOTMART ENDPOINTS (UNIVERSAL SYNC)
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/sync/hotmart
 * Sincronizar user Hotmart individual via Universal Sync
 */
export const syncHotmartEndpoint = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, subdomain, name, status, progress, lastAccess, classes } = req.body
    
    if (!email || !subdomain) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: email, subdomain'
      })
      return
    }
    
    // Buscar dados via adapter (filtrar por email)
    const hotmartData = await hotmartAdapter.fetchHotmartDataForSync()
    
    // Filtrar por email
    const userData = hotmartData.find(u => u.email?.toLowerCase() === email.toLowerCase())
    
    if (!userData) {
      res.status(404).json({
        success: false,
        message: 'User não encontrado na API Hotmart'
      })
      return
    }
    
    // Executar Universal Sync
    const result = await universalSyncService.executeUniversalSync({
      syncType: 'hotmart',
      jobName: `Hotmart Sync - ${email}`,
      triggeredBy: 'MANUAL',
      triggeredByUser: (req as any).user?._id?.toString(),
      fullSync: false,
      includeProgress: true,
      includeTags: false,
      batchSize: 1,
      sourceData: [userData]
    })
    
    res.json({
      success: result.success,
      stats: result.stats,
      reportId: result.reportId
    })
  } catch (error: unknown) {
    forwardSyncFailure(error, next, 'Erro ao sincronizar Hotmart', 'SYNC_HOTMART_USER_FAILED')
  }
}

/**
 * POST /api/sync/hotmart/batch
 * Sincronizar múltiplos users Hotmart via Universal Sync
 */
export const syncHotmartBatchEndpoint = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { subdomain } = req.body
    
    if (!subdomain) {
      res.status(400).json({
        success: false,
        message: 'subdomain is required'
      })
      return
    }
    
    // Buscar TODOS os users via adapter
    const hotmartData = await hotmartAdapter.fetchHotmartDataForSync()
    
    if (hotmartData.length === 0) {
      res.status(200).json({
        success: false,
        message: 'Nenhum user encontrado no Hotmart'
      })
      return
    }
    
    // Executar Universal Sync
    const result = await universalSyncService.executeUniversalSync({
      syncType: 'hotmart',
      jobName: `Hotmart Batch Sync - ${subdomain}`,
      triggeredBy: 'MANUAL',
      triggeredByUser: (req as any).user?._id?.toString(),
      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,
      sourceData: hotmartData
    })
    
    res.json({
      success: result.success,
      stats: result.stats,
      reportId: result.reportId,
      duration: result.duration
    })
  } catch (error: unknown) {
    forwardSyncFailure(error, next, 'Erro ao sincronizar Hotmart batch', 'SYNC_HOTMART_BATCH_FAILED')
  }
}

// ═══════════════════════════════════════════════════════════
// CURSEDUCA ENDPOINTS (UNIVERSAL SYNC)
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/sync/curseduca
 * Sincronizar user CursEduca individual via Universal Sync
 */
export const syncCurseducaEndpoint = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, groupId } = req.body
    
    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Missing required field: email'
      })
      return
    }
    
    // Buscar dados via adapter
    const curseducaData = await curseducaAdapter.fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: true,
      groupId: groupId as string | undefined,
      enrichWithDetails: true
    })
    
    // Filtrar por email
    const userData = curseducaData.find(u => u.email?.toLowerCase() === email.toLowerCase())
    
    if (!userData) {
      res.status(404).json({
        success: false,
        message: 'User não encontrado na API CursEduca'
      })
      return
    }
    
    // Executar Universal Sync
    const result = await universalSyncService.executeUniversalSync({
      syncType: 'curseduca',
      jobName: `CursEduca Sync - ${email}`,
      triggeredBy: 'MANUAL',
      triggeredByUser: (req as any).user?._id?.toString(),
      fullSync: false,
      includeProgress: true,
      includeTags: false,
      batchSize: 1,
      sourceData: [userData]
    })
    
    res.json({
      success: result.success,
      stats: result.stats,
      reportId: result.reportId
    })
  } catch (error: unknown) {
    forwardSyncFailure(error, next, 'Erro ao sincronizar CursEduca', 'SYNC_CURSEDUCA_USER_FAILED')
  }
}

/**
 * POST /api/sync/curseduca/batch
 * Sincronizar múltiplos users CursEduca via Universal Sync
 */
export const syncCurseducaBatchEndpoint = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { groupId } = req.body
    
    // Buscar TODOS os users via adapter
    const curseducaData = await curseducaAdapter.fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: true,
      groupId: groupId as string | undefined,
      enrichWithDetails: true
    })
    
    if (curseducaData.length === 0) {
      res.status(200).json({
        success: false,
        message: 'Nenhum user encontrado na CursEduca'
      })
      return
    }
    
    // Executar Universal Sync
    const result = await universalSyncService.executeUniversalSync({
      syncType: 'curseduca',
      jobName: `CursEduca Batch Sync${groupId ? ` - Group ${groupId}` : ''}`,
      triggeredBy: 'MANUAL',
      triggeredByUser: (req as any).user?._id?.toString(),
      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,
      sourceData: curseducaData
    })
    
    res.json({
      success: result.success,
      stats: result.stats,
      reportId: result.reportId,
      duration: result.duration
    })
  } catch (error: unknown) {
    forwardSyncFailure(error, next, 'Erro ao sincronizar CursEduca batch', 'SYNC_CURSEDUCA_BATCH_FAILED')
  }
}

// ═══════════════════════════════════════════════════════════
// DISCORD ENDPOINTS (DEPRECADOS - A IMPLEMENTAR)
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/sync/discord
 * ⚠️ A IMPLEMENTAR: Criar discord.adapter.ts primeiro
 */
export const syncDiscordEndpoint = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Discord sync ainda não migrado para Universal Sync',
    note: 'Implementar discord.adapter.ts + usar Universal Sync'
  })
}

/**
 * POST /api/sync/discord/csv
 * ⚠️ A IMPLEMENTAR
 */
export const syncDiscordCSVEndpoint = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Discord CSV sync ainda não migrado para Universal Sync',
    note: 'Implementar adapter para processar CSV → UniversalSourceItem[]'
  })
}

/**
 * POST /api/sync/discord/batch
 * ⚠️ A IMPLEMENTAR
 */
export const syncDiscordBatchEndpoint = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Discord batch sync ainda não migrado para Universal Sync'
  })
}

// ═══════════════════════════════════════════════════════════
// SECTION 2: SYNC HISTORY & STATS (SEM ALTERAÇÕES)
// ═══════════════════════════════════════════════════════════
