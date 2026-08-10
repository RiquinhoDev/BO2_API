import { NextFunction, Request, Response } from 'express'
import { criticalTagManagementService } from '../../services/tagMonitoring'
import type { TagMonitoringDeleteInput } from '../../security/tagMonitoringDestructiveInput'
import { internalError } from '../../security/errorHandling'

type CriticalTagParams = {
  id: string
}

/**
 * GET /api/tag-monitoring/critical-tags
 * Lista todas as tags críticas
 */
export const getCriticalTags = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { onlyActive } = req.query
    const tags = await criticalTagManagementService.getCriticalTags(onlyActive === 'true')

    res.json({
      success: true,
      data: tags,
      count: tags.length,
    })
  } catch (error: unknown) {
    next(internalError('Erro ao listar tags críticas', 'CRITICAL_TAG_LIST_FAILED', error))
  }
}

/**
 * POST /api/tag-monitoring/critical-tags
 * Adiciona uma nova tag crítica
 */
export const addCriticalTag = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tagName, description, priority } = req.body
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

    // Validar priority
    const validPriorities = ['CRITICAL', 'MEDIUM', 'LOW']
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Prioridade inválida. Use: CRITICAL, MEDIUM ou LOW',
      })
    }

    const tag = await criticalTagManagementService.addCriticalTag(
      tagName,
      userId,
      description,
      priority
    )

    res.status(201).json({
      success: true,
      message: 'Tag crítica adicionada com sucesso',
      data: tag,
    })
  } catch (error: unknown) {
    if (error instanceof Error) {
      const { message } = error
      if (message.includes('já está marcada')) {
        return res.status(409).json({
          success: false,
          message,
        })
      }
    }

    next(internalError('Erro ao adicionar tag crítica', 'CRITICAL_TAG_ADD_FAILED', error))
  }
}

/**
 * DELETE /api/tag-monitoring/critical-tags/:id
 * Remove uma tag crítica (soft delete)
 */
export const removeCriticalTag = async (req: Request<CriticalTagParams>, res: Response, next: NextFunction) => {
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
  } catch (error: unknown) {
    if (error instanceof Error) {
      const { message } = error
      if (message.includes('não encontrada')) {
        return res.status(404).json({
          success: false,
          message,
        })
      }
    }

    next(internalError('Erro ao remover tag crítica', 'CRITICAL_TAG_REMOVE_FAILED', error))
  }
}

/**
 * DELETE /api/tag-monitoring/critical-tags/:id/permanent
 * Remove permanentemente uma tag crítica
 */
export const deleteCriticalTag = async (
  input: TagMonitoringDeleteInput,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = input.params

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
  } catch (error: unknown) {
    if (error instanceof Error) {
      const { message } = error
      if (message.includes('não encontrada')) {
        return res.status(404).json({
          success: false,
          message,
        })
      }
    }

    next(internalError('Erro ao deletar tag crítica', 'CRITICAL_TAG_DELETE_FAILED', error))
  }
}

/**
 * PATCH /api/tag-monitoring/critical-tags/:id/toggle
 * Alterna o estado ativo/inativo de uma tag crítica
 */
export const toggleCriticalTag = async (req: Request<CriticalTagParams>, res: Response, next: NextFunction) => {
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
  } catch (error: unknown) {
    if (error instanceof Error) {
      const { message } = error
      if (message.includes('não encontrada')) {
        return res.status(404).json({
          success: false,
          message,
        })
      }
    }

    next(internalError('Erro ao alternar tag crítica', 'CRITICAL_TAG_TOGGLE_FAILED', error))
  }
}

/**
 * PATCH /api/tag-monitoring/critical-tags/:id/priority
 * Atualiza a prioridade de uma tag crítica
 */
export const updateCriticalTagPriority = async (req: Request<CriticalTagParams>, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params
    const { priority } = req.body

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da tag é obrigatório',
      })
    }

    const validPriorities = ['CRITICAL', 'MEDIUM', 'LOW']
    if (!priority || !validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Prioridade inválida. Use: CRITICAL, MEDIUM ou LOW',
      })
    }

    const tag = await criticalTagManagementService.updatePriority(id, priority)

    res.json({
      success: true,
      message: `Prioridade atualizada para ${priority}`,
      data: tag,
    })
  } catch (error: unknown) {
    if (error instanceof Error) {
      const { message } = error
      if (message.includes('não encontrada')) {
        return res.status(404).json({
          success: false,
          message,
        })
      }
    }

    next(internalError('Erro ao atualizar prioridade', 'CRITICAL_TAG_PRIORITY_UPDATE_FAILED', error))
  }
}

/**
 * GET /api/tag-monitoring/critical-tags/available-native-tags
 * Descobre tags nativas disponíveis nos snapshots recentes
 */
export const getAvailableNativeTags = async (req: Request, res: Response, next: NextFunction) => {
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
  } catch (error: unknown) {
    next(internalError('Erro ao descobrir tags nativas', 'CRITICAL_TAG_NATIVE_TAGS_FAILED', error))
  }
}

/**
 * GET /api/tag-monitoring/critical-tags/stats
 * Estatísticas de tags críticas
 */
export const getCriticalTagsStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await criticalTagManagementService.getStats()

    res.json({
      success: true,
      data: stats,
    })
  } catch (error: unknown) {
    next(internalError('Erro ao obter estatísticas', 'CRITICAL_TAG_STATS_FAILED', error))
  }
}
