// ════════════════════════════════════════════════════════════
// 📁 src/controllers/syncUtilizadoresControllers/syncReports.controller.ts
// Controller: Sync Reports API
// ════════════════════════════════════════════════════════════

import { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../contracts/responseContract'
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
    const { limit, syncType } = req.query
    
    console.log('📋 [ReportsController] Buscando reports...')
    
    // Legacy raw-query compatibility: invalid/repeated syncType values reached the model filter unchanged.
    const reports = await syncReportsService.getReports(
      limit ? parseInt(String(limit), 10) : 20,
      syncType as any,
    )
    
    res.status(200).json(successResponse({ reports }, { total: reports.length, message: 'Reports recuperados com sucesso' }))
    
  } catch (error: unknown) {
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
    next(internalError('Erro ao buscar report', 'SYNC_REPORT_READ_FAILED', error))
  }
}

// ═══════════════════════════════════════════════════════════
// GET AGGREGATED STATS
// GET /api/sync/reports/stats
// ═══════════════════════════════════════════════════════════

export const getAggregatedStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { days } = req.query
    
    console.log('📊 [ReportsController] Buscando stats agregados...')
    
    const stats = await syncReportsService.getAggregatedStats(
      days ? parseInt(String(days), 10) : 30,
    )
    
    res.status(200).json({
      success: true,
      message: 'Stats agregados recuperados com sucesso',
      data: { stats }
    })
    
  } catch (error: unknown) {
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
