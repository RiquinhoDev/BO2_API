import { NextFunction, Request, Response } from 'express'
import { tagNotificationService } from '../../services/tagMonitoring'
import { internalError } from '../../security/errorHandling'
import type { TagMonitoringDeleteInput } from '../../security/tagMonitoringDestructiveInput'

type NotificationIdParams = {
  id: string
}

function errorMessage(cause: unknown): string | undefined {
  return cause instanceof Error ? cause.message : undefined
}

/**
 * GET /api/tag-monitoring/notifications
 * Lista notificações com filtros opcionais
 */
export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
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
  } catch (cause: unknown) {
    next(internalError('Erro ao listar notificações', 'TAG_NOTIFICATION_LIST_FAILED', cause))
  }
}

/**
 * GET /api/tag-monitoring/notifications/:id
 * Busca uma notificação específica com detalhes
 */
export const getNotificationById = async (
  req: Request<NotificationIdParams>,
  res: Response,
  next: NextFunction,
) => {
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
  } catch (cause: unknown) {
    next(internalError('Erro ao buscar notificação', 'TAG_NOTIFICATION_DETAIL_FAILED', cause))
  }
}

/**
 * GET /api/tag-monitoring/notifications/:id/details
 * Busca detalhes de uma notificação (lista de alunos afetados)
 */
export const getNotificationDetails = async (
  req: Request<NotificationIdParams>,
  res: Response,
  next: NextFunction,
) => {
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
  } catch (cause: unknown) {
    next(internalError('Erro ao buscar detalhes', 'TAG_NOTIFICATION_DETAILS_FAILED', cause))
  }
}

/**
 * PATCH /api/tag-monitoring/notifications/:id/read
 * Marca uma notificação como lida
 */
export const markAsRead = async (
  req: Request<NotificationIdParams>,
  res: Response,
  next: NextFunction,
) => {
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
  } catch (cause: unknown) {
    const message = errorMessage(cause)
    if (message?.includes('não encontrada')) {
      return res.status(404).json({ success: false, message })
    }
    next(internalError('Erro ao marcar como lida', 'TAG_NOTIFICATION_MARK_READ_FAILED', cause))
  }
}

/**
 * PATCH /api/tag-monitoring/notifications/:id/unread
 * Marca uma notificação como não lida
 */
export const markAsUnread = async (
  req: Request<NotificationIdParams>,
  res: Response,
  next: NextFunction,
) => {
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
  } catch (cause: unknown) {
    const message = errorMessage(cause)
    if (message?.includes('não encontrada')) {
      return res.status(404).json({ success: false, message })
    }
    next(internalError('Erro ao marcar como não lida', 'TAG_NOTIFICATION_MARK_UNREAD_FAILED', cause))
  }
}

/**
 * DELETE /api/tag-monitoring/notifications/:id
 * Remove uma notificação
 */
export const dismissNotification = async (
  input: TagMonitoringDeleteInput,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = input.params

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
  } catch (cause: unknown) {
    const message = errorMessage(cause)
    if (message?.includes('não encontrada')) {
      return res.status(404).json({ success: false, message })
    }
    next(internalError('Erro ao remover notificação', 'TAG_NOTIFICATION_DISMISS_FAILED', cause))
  }
}

/**
 * GET /api/tag-monitoring/notifications/unread/count
 * Obtém contagem de notificações não lidas
 */
export const getUnreadCount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await tagNotificationService.getUnreadCount()

    res.json({
      success: true,
      data: { count },
    })
  } catch (cause: unknown) {
    next(internalError('Erro ao obter contagem', 'TAG_NOTIFICATION_UNREAD_COUNT_FAILED', cause))
  }
}

/**
 * PATCH /api/tag-monitoring/notifications/mark-all-read
 * Marca todas as notificações como lidas
 */
export const markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await tagNotificationService.markAllAsRead()

    res.json({
      success: true,
      message: `${count} notificações marcadas como lidas`,
      data: { count },
    })
  } catch (cause: unknown) {
    next(internalError('Erro ao marcar todas como lidas', 'TAG_NOTIFICATION_MARK_ALL_READ_FAILED', cause))
  }
}

/**
 * GET /api/tag-monitoring/notifications/stats
 * Estatísticas de notificações
 */
export const getNotificationStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await tagNotificationService.getStats()

    res.json({
      success: true,
      data: stats,
    })
  } catch (cause: unknown) {
    next(internalError('Erro ao obter estatísticas', 'TAG_NOTIFICATION_STATS_FAILED', cause))
  }
}
