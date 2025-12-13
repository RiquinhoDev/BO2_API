// ════════════════════════════════════════════════════════════
// 📁 src/controllers/syncUtilizadoresControllers/syncReports.controller.ts
// Controller: Sync Reports API
// ════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import syncReportsService from '../../services/syncUtilziadoresServices/syncReports.service'


// ═══════════════════════════════════════════════════════════
// GET ALL REPORTS
// GET /api/sync/reports
// ═══════════════════════════════════════════════════════════

export const getAllReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit, syncType } = req.query
    
    console.log('📋 [ReportsController] Buscando reports...')
    
    const reports = await syncReportsService.getReports(
      limit ? parseInt(limit as string) : 20,
      syncType as any
    )
    
    res.status(200).json({
      success: true,
      message: 'Reports recuperados com sucesso',
      data: {
        reports,
        total: reports.length
      }
    })
    
  } catch (error: any) {
    console.error('❌ [ReportsController] Erro ao buscar reports:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar reports',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// GET REPORT BY ID
// GET /api/sync/reports/:id
// ═══════════════════════════════════════════════════════════

export const getReportById = async (req: Request, res: Response): Promise<void> => {
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
    
  } catch (error: any) {
    console.error('❌ [ReportsController] Erro ao buscar report:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar report',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// GET REPORTS BY JOB
// GET /api/cron/jobs/:jobId/reports
// ═══════════════════════════════════════════════════════════

export const getReportsByJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params
    const { limit } = req.query
    
    console.log(`📋 [ReportsController] Buscando reports do job: ${jobId}`)
    
    const reports = await syncReportsService.getReportsByJob(
      jobId,
      limit ? parseInt(limit as string) : 20
    )
    
    res.status(200).json({
      success: true,
      message: 'Reports do job recuperados com sucesso',
      data: {
        reports,
        total: reports.length,
        jobId
      }
    })
    
  } catch (error: any) {
    console.error('❌ [ReportsController] Erro ao buscar reports do job:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar reports do job',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// GET AGGREGATED STATS
// GET /api/sync/reports/stats
// ═══════════════════════════════════════════════════════════

export const getAggregatedStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { days } = req.query
    
    console.log('📊 [ReportsController] Buscando stats agregados...')
    
    const stats = await syncReportsService.getAggregatedStats(
      days ? parseInt(days as string) : 30
    )
    
    res.status(200).json({
      success: true,
      message: 'Stats agregados recuperados com sucesso',
      data: { stats }
    })
    
  } catch (error: any) {
    console.error('❌ [ReportsController] Erro ao buscar stats:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar stats agregados',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  getAllReports,
  getReportById,
  getReportsByJob,
  getAggregatedStats
}