import { Request, Response } from 'express'
import { weeklyTagMonitoringService } from '../../services/tagMonitoring'
import { WeeklyNativeTagSnapshot, WeeklyTagMonitoringConfig } from '../../models/tagMonitoring'
import logger from '../../utils/logger'

/**
 * GET /api/tag-monitoring/snapshots
 * Lista snapshots recentes
 */
export const getSnapshots = async (req: Request, res: Response) => {
  try {
    const { limit, weekNumber, year } = req.query

    const query: any = {}
    if (weekNumber) query.weekNumber = parseInt(weekNumber as string)
    if (year) query.year = parseInt(year as string)

    const snapshots = await WeeklyNativeTagSnapshot.find(query)
      .sort({ capturedAt: -1 })
      .limit(limit ? parseInt(limit as string) : 100)
      .lean()

    res.json({
      success: true,
      data: snapshots,
      count: snapshots.length,
    })
  } catch (error: any) {
    logger.error('Erro ao listar snapshots:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao listar snapshots',
      error: error.message,
    })
  }
}

/**
 * GET /api/tag-monitoring/snapshots/user/:email
 * Histórico de snapshots de um aluno específico
 */
export const getSnapshotsByEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.params
    const { limit } = req.query

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email é obrigatório',
      })
    }

    const snapshots = await WeeklyNativeTagSnapshot.findByEmail(
      email,
      limit ? parseInt(limit as string) : 10
    )

    res.json({
      success: true,
      data: snapshots,
      count: snapshots.length,
      email,
    })
  } catch (error: any) {
    logger.error('Erro ao buscar snapshots por email:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar snapshots',
      error: error.message,
    })
  }
}

/**
 * GET /api/tag-monitoring/snapshots/compare
 * Compara dois snapshots (semanas diferentes)
 */
export const compareSnapshots = async (req: Request, res: Response) => {
  try {
    const { email, week1, year1, week2, year2 } = req.query

    if (!email || !week1 || !year1 || !week2 || !year2) {
      return res.status(400).json({
        success: false,
        message: 'Email, week1, year1, week2 e year2 são obrigatórios',
      })
    }

    const [snapshot1, snapshot2] = await Promise.all([
      WeeklyNativeTagSnapshot.findOne({
        email: email as string,
        weekNumber: parseInt(week1 as string),
        year: parseInt(year1 as string),
      }),
      WeeklyNativeTagSnapshot.findOne({
        email: email as string,
        weekNumber: parseInt(week2 as string),
        year: parseInt(year2 as string),
      }),
    ])

    if (!snapshot1 || !snapshot2) {
      return res.status(404).json({
        success: false,
        message: 'Um ou ambos os snapshots não foram encontrados',
      })
    }

    const changes = snapshot2.compareWith(snapshot1)

    res.json({
      success: true,
      data: {
        snapshot1: {
          week: snapshot1.weekNumber,
          year: snapshot1.year,
          tags: snapshot1.nativeTags,
          capturedAt: snapshot1.capturedAt,
        },
        snapshot2: {
          week: snapshot2.weekNumber,
          year: snapshot2.year,
          tags: snapshot2.nativeTags,
          capturedAt: snapshot2.capturedAt,
        },
        changes,
      },
    })
  } catch (error: any) {
    logger.error('Erro ao comparar snapshots:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao comparar snapshots',
      error: error.message,
    })
  }
}

/**
 * POST /api/tag-monitoring/snapshots/manual
 * Executa um snapshot manual (fora do CRON)
 */
export const executeManualSnapshot = async (req: Request, res: Response) => {
  try {
    logger.info('🚀 Snapshot manual solicitado pelo admin')

    const result = await weeklyTagMonitoringService.performWeeklySnapshot()

    res.json({
      success: true,
      message: 'Snapshot manual executado com sucesso',
      data: result,
    })
  } catch (error: any) {
    logger.error('Erro ao executar snapshot manual:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao executar snapshot manual',
      error: error.message,
    })
  }
}

/**
 * GET /api/tag-monitoring/stats
 * Estatísticas globais do sistema
 */
export const getStats = async (req: Request, res: Response) => {
  try {
    const stats = await weeklyTagMonitoringService.getSnapshotStats()

    res.json({
      success: true,
      data: stats,
    })
  } catch (error: any) {
    logger.error('Erro ao obter estatísticas:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao obter estatísticas',
      error: error.message,
    })
  }
}

/**
 * GET /api/tag-monitoring/stats/weekly
 * Estatísticas semanais
 */
export const getWeeklyStats = async (req: Request, res: Response) => {
  try {
    const { weekNumber, year } = req.query

    if (!weekNumber || !year) {
      return res.status(400).json({
        success: false,
        message: 'weekNumber e year são obrigatórios',
      })
    }

    const snapshots = await WeeklyNativeTagSnapshot.findByWeek(
      parseInt(weekNumber as string),
      parseInt(year as string)
    )

    const totalTags = snapshots.reduce((sum, s) => sum + s.nativeTags.length, 0)
    const avgTagsPerStudent = snapshots.length > 0 ? totalTags / snapshots.length : 0

    res.json({
      success: true,
      data: {
        weekNumber: parseInt(weekNumber as string),
        year: parseInt(year as string),
        totalSnapshots: snapshots.length,
        totalTags,
        avgTagsPerStudent: avgTagsPerStudent.toFixed(2),
      },
    })
  } catch (error: any) {
    logger.error('Erro ao obter estatísticas semanais:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao obter estatísticas semanais',
      error: error.message,
    })
  }
}

/**
 * GET /api/tag-monitoring/config/scope
 * Busca configuração atual do scope
 */
export const getScopeConfig = async (req: Request, res: Response) => {
  try {
    const config = await WeeklyTagMonitoringConfig.getConfig()

    res.json({
      success: true,
      data: {
        scope: config.scope,
        enabled: config.enabled,
      },
    })
  } catch (error: any) {
    logger.error('Erro ao buscar configuração de scope:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar configuração',
      error: error.message,
    })
  }
}

/**
 * PATCH /api/tag-monitoring/config/scope
 * Atualiza configuração do scope
 */
export const updateScopeConfig = async (req: Request, res: Response) => {
  try {
    const { scope } = req.body

    if (!scope || !['STUDENTS_ONLY', 'ALL_CONTACTS'].includes(scope)) {
      return res.status(400).json({
        success: false,
        message: 'Scope inválido. Use STUDENTS_ONLY ou ALL_CONTACTS',
      })
    }

    const config = await WeeklyTagMonitoringConfig.updateScope(scope)

    logger.info(`📋 Configuração de scope atualizada para: ${scope}`)

    res.json({
      success: true,
      message: 'Configuração atualizada com sucesso',
      data: {
        scope: config.scope,
        enabled: config.enabled,
      },
    })
  } catch (error: any) {
    logger.error('Erro ao atualizar configuração de scope:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar configuração',
      error: error.message,
    })
  }
}

/**
 * PATCH /api/tag-monitoring/config/toggle
 * Ativa/desativa o sistema de monitorização
 */
export const toggleMonitoring = async (req: Request, res: Response) => {
  try {
    const config = await WeeklyTagMonitoringConfig.toggleEnabled()

    logger.info(`📋 Sistema de monitorização ${config.enabled ? 'ativado' : 'desativado'}`)

    res.json({
      success: true,
      message: `Sistema ${config.enabled ? 'ativado' : 'desativado'} com sucesso`,
      data: {
        scope: config.scope,
        enabled: config.enabled,
      },
    })
  } catch (error: any) {
    logger.error('Erro ao alternar sistema de monitorização:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao alternar sistema',
      error: error.message,
    })
  }
}

/**
 * GET /api/tag-monitoring/students-by-priority
 * Busca alunos que possuem tags de determinadas prioridades
 */
export const getStudentsByPriority = async (req: Request, res: Response) => {
  try {
    const { priorities, tagName, limit, skip } = req.query

    // Parse priorities[] array
    let prioritiesArray: ('CRITICAL' | 'MEDIUM' | 'LOW')[] | undefined
    if (priorities) {
      if (Array.isArray(priorities)) {
        prioritiesArray = priorities as ('CRITICAL' | 'MEDIUM' | 'LOW')[]
      } else {
        prioritiesArray = [priorities as 'CRITICAL' | 'MEDIUM' | 'LOW']
      }
    }

    const params = {
      priorities: prioritiesArray,
      tagName: tagName as string | undefined,
      limit: limit ? parseInt(limit as string) : 20,
      skip: skip ? parseInt(skip as string) : 0,
    }

    const result = await weeklyTagMonitoringService.getStudentsByPriority(params)

    res.json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Erro ao buscar alunos por prioridade:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar alunos por prioridade',
      error: error.message,
    })
  }
}
