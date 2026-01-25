import { Request, Response } from 'express'
import { criticalTagManagementService } from '../../services/tagMonitoring'
import logger from '../../utils/logger'

/**
 * GET /api/tag-monitoring/critical-tags
 * Lista todas as tags críticas
 */
export const getCriticalTags = async (req: Request, res: Response) => {
  try {
    const { onlyActive } = req.query
    const tags = await criticalTagManagementService.getCriticalTags(onlyActive === 'true')

    res.json({
      success: true,
      data: tags,
      count: tags.length,
    })
  } catch (error: any) {
    logger.error('Erro ao listar tags críticas:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao listar tags críticas',
      error: error.message,
    })
  }
}

/**
 * POST /api/tag-monitoring/critical-tags
 * Adiciona uma nova tag crítica
 */
export const addCriticalTag = async (req: Request, res: Response) => {
  try {
    const { tagName, description } = req.body
    const userId = req.user?.id

    if (!tagName) {
      return res.status(400).json({
        success: false,
        message: 'Nome da tag é obrigatório',
      })
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilizador não autenticado',
      })
    }

    const tag = await criticalTagManagementService.addCriticalTag(tagName, userId, description)

    res.status(201).json({
      success: true,
      message: 'Tag crítica adicionada com sucesso',
      data: tag,
    })
  } catch (error: any) {
    logger.error('Erro ao adicionar tag crítica:', error)

    if (error.message.includes('já está marcada')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      })
    }

    res.status(500).json({
      success: false,
      message: 'Erro ao adicionar tag crítica',
      error: error.message,
    })
  }
}

/**
 * DELETE /api/tag-monitoring/critical-tags/:id
 * Remove uma tag crítica (soft delete)
 */
export const removeCriticalTag = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da tag é obrigatório',
      })
    }

    await criticalTagManagementService.removeCriticalTag(id)

    res.json({
      success: true,
      message: 'Tag crítica removida com sucesso',
    })
  } catch (error: any) {
    logger.error('Erro ao remover tag crítica:', error)

    if (error.message.includes('não encontrada')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      })
    }

    res.status(500).json({
      success: false,
      message: 'Erro ao remover tag crítica',
      error: error.message,
    })
  }
}

/**
 * DELETE /api/tag-monitoring/critical-tags/:id/permanent
 * Remove permanentemente uma tag crítica
 */
export const deleteCriticalTag = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da tag é obrigatório',
      })
    }

    await criticalTagManagementService.deleteCriticalTag(id)

    res.json({
      success: true,
      message: 'Tag crítica deletada permanentemente',
    })
  } catch (error: any) {
    logger.error('Erro ao deletar tag crítica:', error)

    if (error.message.includes('não encontrada')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      })
    }

    res.status(500).json({
      success: false,
      message: 'Erro ao deletar tag crítica',
      error: error.message,
    })
  }
}

/**
 * PATCH /api/tag-monitoring/critical-tags/:id/toggle
 * Alterna o estado ativo/inativo de uma tag crítica
 */
export const toggleCriticalTag = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da tag é obrigatório',
      })
    }

    const tag = await criticalTagManagementService.toggleCriticalTag(id)

    res.json({
      success: true,
      message: `Tag crítica ${tag.isActive ? 'ativada' : 'desativada'} com sucesso`,
      data: tag,
    })
  } catch (error: any) {
    logger.error('Erro ao alternar tag crítica:', error)

    if (error.message.includes('não encontrada')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      })
    }

    res.status(500).json({
      success: false,
      message: 'Erro ao alternar tag crítica',
      error: error.message,
    })
  }
}

/**
 * GET /api/tag-monitoring/critical-tags/available-native-tags
 * Descobre tags nativas disponíveis nos snapshots recentes
 */
export const getAvailableNativeTags = async (req: Request, res: Response) => {
  try {
    const { weeksBack } = req.query
    const weeks = weeksBack ? parseInt(weeksBack as string) : 4

    const tags = await criticalTagManagementService.discoverNativeTagsFromSnapshots(weeks)

    res.json({
      success: true,
      data: tags,
      count: tags.length,
      weeksAnalyzed: weeks,
    })
  } catch (error: any) {
    logger.error('Erro ao descobrir tags nativas:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao descobrir tags nativas',
      error: error.message,
    })
  }
}

/**
 * GET /api/tag-monitoring/critical-tags/stats
 * Estatísticas de tags críticas
 */
export const getCriticalTagsStats = async (req: Request, res: Response) => {
  try {
    const stats = await criticalTagManagementService.getStats()

    res.json({
      success: true,
      data: stats,
    })
  } catch (error: any) {
    logger.error('Erro ao obter estatísticas de tags críticas:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao obter estatísticas',
      error: error.message,
    })
  }
}
