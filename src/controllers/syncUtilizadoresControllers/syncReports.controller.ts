// ════════════════════════════════════════════════════════════
// 📁 src/controllers/syncUtilizadoresControllers/syncReports.controller.ts
// Controller: Sync Reports API
// ════════════════════════════════════════════════════════════

import { NextFunction, Request, Response } from 'express'
import type { SyncType } from '../../models/SyncModels/SyncReport'
import { internalError } from '../../security/errorHandling'
import syncReportsService from '../../services/syncUtilizadoresServices/syncReports.service'

type SyncReportParams = {
  id: string
}

// ═══════════════════════════════════════════════════════════
// GET ALL REPORTS
// GET /api/sync/reports
// ═══════════════════════════════════════════════════════════

export const getAllReports = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const requestedLimit = req.query.limit
    const requestedSyncType = req.query.syncType
    const syncType: SyncType | undefined =
      requestedSyncType === 'hotmart' || requestedSyncType === 'curseduca' ||
      requestedSyncType === 'discord' || requestedSyncType === 'all'
        ? requestedSyncType
        : undefined
    
    console.log('📋 [ReportsController] Buscando reports...')
    
    const limit = typeof requestedLimit === 'string'
      ? parseInt(requestedLimit, 10)
      : 20
    const reports = await syncReportsService.getReports(limit, syncType)
    
    res.status(200).json({
      success: true,
      message: 'Reports recuperados com sucesso',
      data: {
        reports,
        total: reports.length
      }
    })
    
  } catch (error: unknown) {
    console.error('❌ [ReportsController] Erro ao buscar reports:', error)
    next(internalError('Erro ao buscar reports', 'SYNC_REPORT_LIST_FAILED', error))
  }
}

// ═══════════════════════════════════════════════════════════
// GET REPORT BY ID
// GET /api/sync/reports/:id
// ═══════════════════════════════════════════════════════════

export const getReportById = async (req: Request<SyncReportParams>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params
    
    console.log(`📋 [ReportsController] Buscando report: ${id}`)
    
    const report = await syncReportsService.getReportById(id)
    
    if (!report) {
      res.status(404).json({
        success: false,
        message: 'Report não encontrado'
      })
      return
    }
    
    res.status(200).json({
      success: true,
      message: 'Report recuperado com sucesso',
      data: { report }
    })
    
  } catch (error: unknown) {
    console.error('❌ [ReportsController] Erro ao buscar report:', error)
    next(internalError('Erro ao buscar report', 'SYNC_REPORT_READ_FAILED', error))
  }
}

// ═══════════════════════════════════════════════════════════
// GET AGGREGATED STATS
// GET /api/sync/reports/stats
// ═══════════════════════════════════════════════════════════

export const getAggregatedStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const requestedDays = req.query.days
    const days = typeof requestedDays === 'string'
      ? parseInt(requestedDays, 10)
      : 30
    
    console.log('📊 [ReportsController] Buscando stats agregados...')
    
    const stats = await syncReportsService.getAggregatedStats(days)
    
    res.status(200).json({
      success: true,
      message: 'Stats agregados recuperados com sucesso',
      data: { stats }
    })
    
  } catch (error: unknown) {
    console.error('❌ [ReportsController] Erro ao buscar stats:', error)
    next(internalError('Erro ao buscar stats agregados', 'SYNC_REPORT_STATS_FAILED', error))
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  getAllReports,
  getReportById,
  getAggregatedStats
}
