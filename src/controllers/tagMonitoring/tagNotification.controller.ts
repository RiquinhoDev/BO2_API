import { Request, Response } from 'express'
import { tagNotificationService } from '../../services/tagMonitoring'
import logger from '../../utils/logger'

/**
 * GET /api/tag-monitoring/notifications
 * Lista notificações com filtros opcionais
 */
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const { isRead, limit, skip, weekNumber, year, tagName } = req.query

    const filters = {
      isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
      limit: limit ? parseInt(limit as string) : 50,
      skip: skip ? parseInt(skip as string) : 0,
      weekNumber: weekNumber ? parseInt(weekNumber as string) : undefined,
      year: year ? parseInt(year as string) : undefined,
      tagName: tagName as string | undefined,
    }

    const notifications = await tagNotificationService.getNotifications(filters)

    res.json({
      success: true,
      data: notifications,
      count: notifications.length,
      filters,
    })
  } catch (error: any) {
    logger.error('Erro ao listar notificações:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao listar notificações',
      error: error.message,
    })
  }
}

/**
 * GET /api/tag-monitoring/notifications/:id
 * Busca uma notificação específica com detalhes
 */
export const getNotificationById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da notificação é obrigatório',
      })
    }

    const notification = await tagNotificationService.getNotificationById(id)

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notificação não encontrada',
      })
    }

    res.json({
      success: true,
      data: notification,
    })
  } catch (error: any) {
    logger.error('Erro ao buscar notificação:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar notificação',
      error: error.message,
    })
  }
}

/**
 * GET /api/tag-monitoring/notifications/:id/details
 * Busca detalhes de uma notificação (lista de alunos afetados)
 */
export const getNotificationDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da notificação é obrigatório',
      })
    }

    const details = await tagNotificationService.getNotificationDetails(id)

    res.json({
      success: true,
      data: details,
      count: details.length,
    })
  } catch (error: any) {
    logger.error('Erro ao buscar detalhes da notificação:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar detalhes',
      error: error.message,
    })
  }
}

/**
 * PATCH /api/tag-monitoring/notifications/:id/read
 * Marca uma notificação como lida
 */
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da notificação é obrigatório',
      })
    }

    const notification = await tagNotificationService.markAsRead(id)

    res.json({
      success: true,
      message: 'Notificação marcada como lida',
      data: notification,
    })
  } catch (error: any) {
    logger.error('Erro ao marcar notificação como lida:', error)

    if (error.message.includes('não encontrada')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      })
    }

    res.status(500).json({
      success: false,
      message: 'Erro ao marcar como lida',
      error: error.message,
    })
  }
}

/**
 * PATCH /api/tag-monitoring/notifications/:id/unread
 * Marca uma notificação como não lida
 */
export const markAsUnread = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da notificação é obrigatório',
      })
    }

    const notification = await tagNotificationService.markAsUnread(id)

    res.json({
      success: true,
      message: 'Notificação marcada como não lida',
      data: notification,
    })
  } catch (error: any) {
    logger.error('Erro ao marcar notificação como não lida:', error)

    if (error.message.includes('não encontrada')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      })
    }

    res.status(500).json({
      success: false,
      message: 'Erro ao marcar como não lida',
      error: error.message,
    })
  }
}

/**
 * DELETE /api/tag-monitoring/notifications/:id
 * Remove uma notificação
 */
export const dismissNotification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da notificação é obrigatório',
      })
    }

    await tagNotificationService.dismissNotification(id)

    res.json({
      success: true,
      message: 'Notificação removida com sucesso',
    })
  } catch (error: any) {
    logger.error('Erro ao remover notificação:', error)

    if (error.message.includes('não encontrada')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      })
    }

    res.status(500).json({
      success: false,
      message: 'Erro ao remover notificação',
      error: error.message,
    })
  }
}

/**
 * GET /api/tag-monitoring/notifications/unread/count
 * Obtém contagem de notificações não lidas
 */
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const count = await tagNotificationService.getUnreadCount()

    res.json({
      success: true,
      data: { count },
    })
  } catch (error: any) {
    logger.error('Erro ao obter contagem de não lidas:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao obter contagem',
      error: error.message,
    })
  }
}

/**
 * PATCH /api/tag-monitoring/notifications/mark-all-read
 * Marca todas as notificações como lidas
 */
export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const count = await tagNotificationService.markAllAsRead()

    res.json({
      success: true,
      message: `${count} notificações marcadas como lidas`,
      data: { count },
    })
  } catch (error: any) {
    logger.error('Erro ao marcar todas como lidas:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao marcar todas como lidas',
      error: error.message,
    })
  }
}

/**
 * GET /api/tag-monitoring/notifications/stats
 * Estatísticas de notificações
 */
export const getNotificationStats = async (req: Request, res: Response) => {
  try {
    const stats = await tagNotificationService.getStats()

    res.json({
      success: true,
      data: stats,
    })
  } catch (error: any) {
    logger.error('Erro ao obter estatísticas de notificações:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao obter estatísticas',
      error: error.message,
    })
  }
}
