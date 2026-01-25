import {
  TagChangeNotification,
  TagChangeDetail,
  ITagChangeNotification,
  ITagChangeDetail,
} from '../../models/tagMonitoring'
import logger from '../../utils/logger'

export interface StudentChange {
  email: string
  userName: string
  product: string
  class?: string
  currentTags: string[]
}

export interface NotificationFilters {
  isRead?: boolean
  limit?: number
  skip?: number
  weekNumber?: number
  year?: number
  tagName?: string
}

/**
 * Serviço de Gestão de Notificações de Mudanças em Tags
 * Responsável por criar, listar e gerir notificações agrupadas
 */
class TagNotificationService {
  /**
   * Cria uma notificação agrupada com detalhes individuais
   */
  async createGroupedNotification(
    tagName: string,
    changeType: 'ADDED' | 'REMOVED',
    weekNumber: number,
    year: number,
    students: StudentChange[]
  ): Promise<ITagChangeNotification> {
    try {
      // Verificar se já existe notificação para esta tag/tipo/semana
      const existing = await TagChangeNotification.findOne({
        tagName,
        changeType,
        weekNumber,
        year,
      })

      if (existing) {
        logger.warn(`Notificação já existe para ${tagName} ${changeType} na semana ${weekNumber}/${year}`)
        return existing
      }

      // Criar detalhes individuais
      const detailsPromises = students.map((student) =>
        TagChangeDetail.create({
          notificationId: null, // Será atualizado depois
          email: student.email,
          userName: student.userName,
          product: student.product,
          class: student.class,
          currentTags: student.currentTags,
          detectedAt: new Date(),
        })
      )

      const details = await Promise.all(detailsPromises)

      // Criar notificação agrupada
      const notification = await TagChangeNotification.create({
        tagName,
        changeType,
        affectedCount: students.length,
        weekNumber,
        year,
        isRead: false,
        detailsIds: details.map((d) => d._id),
      })

      // Atualizar detalhes com notificationId
      await TagChangeDetail.updateMany(
        { _id: { $in: details.map((d) => d._id) } },
        { $set: { notificationId: notification._id } }
      )

      logger.info(`Notificação criada: ${tagName} ${changeType} - ${students.length} alunos afetados`, {
        notificationId: notification._id,
        weekNumber,
        year,
      })

      return notification
    } catch (error) {
      logger.error('Erro ao criar notificação agrupada', { tagName, changeType, error })
      throw error
    }
  }

  /**
   * Lista notificações com filtros opcionais
   */
  async getNotifications(filters: NotificationFilters = {}): Promise<ITagChangeNotification[]> {
    try {
      const {
        isRead,
        limit = 50,
        skip = 0,
        weekNumber,
        year,
        tagName,
      } = filters

      const query: any = {}
      if (isRead !== undefined) query.isRead = isRead
      if (weekNumber !== undefined) query.weekNumber = weekNumber
      if (year !== undefined) query.year = year
      if (tagName) query.tagName = tagName

      const notifications = await TagChangeNotification.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)

      return notifications
    } catch (error) {
      logger.error('Erro ao listar notificações', { filters, error })
      throw error
    }
  }

  /**
   * Busca detalhes de uma notificação específica
   */
  async getNotificationDetails(notificationId: string): Promise<ITagChangeDetail[]> {
    try {
      const details = await TagChangeDetail.findByNotification(notificationId)
      return details
    } catch (error) {
      logger.error('Erro ao buscar detalhes da notificação', { notificationId, error })
      throw error
    }
  }

  /**
   * Busca uma notificação por ID com detalhes populados
   */
  async getNotificationById(notificationId: string): Promise<ITagChangeNotification | null> {
    try {
      const notification = await TagChangeNotification.findById(notificationId)
      return notification
    } catch (error) {
      logger.error('Erro ao buscar notificação por ID', { notificationId, error })
      throw error
    }
  }

  /**
   * Marca uma notificação como lida
   */
  async markAsRead(notificationId: string): Promise<ITagChangeNotification> {
    try {
      const notification = await TagChangeNotification.findById(notificationId)
      if (!notification) {
        throw new Error('Notificação não encontrada')
      }

      await notification.markAsRead()
      logger.info(`Notificação marcada como lida: ${notificationId}`)

      return notification
    } catch (error) {
      logger.error('Erro ao marcar notificação como lida', { notificationId, error })
      throw error
    }
  }

  /**
   * Marca uma notificação como não lida
   */
  async markAsUnread(notificationId: string): Promise<ITagChangeNotification> {
    try {
      const notification = await TagChangeNotification.findById(notificationId)
      if (!notification) {
        throw new Error('Notificação não encontrada')
      }

      await notification.markAsUnread()
      logger.info(`Notificação marcada como não lida: ${notificationId}`)

      return notification
    } catch (error) {
      logger.error('Erro ao marcar notificação como não lida', { notificationId, error })
      throw error
    }
  }

  /**
   * Remove uma notificação e seus detalhes
   */
  async dismissNotification(notificationId: string): Promise<void> {
    try {
      // Remover detalhes primeiro
      await TagChangeDetail.deleteMany({ notificationId })

      // Remover notificação
      const notification = await TagChangeNotification.findByIdAndDelete(notificationId)
      if (!notification) {
        throw new Error('Notificação não encontrada')
      }

      logger.info(`Notificação descartada: ${notificationId}`)
    } catch (error) {
      logger.error('Erro ao descartar notificação', { notificationId, error })
      throw error
    }
  }

  /**
   * Obtém contagem de notificações não lidas
   */
  async getUnreadCount(): Promise<number> {
    try {
      const count = await TagChangeNotification.getUnreadCount()
      return count
    } catch (error) {
      logger.error('Erro ao obter contagem de não lidas', { error })
      throw error
    }
  }

  /**
   * Marca todas as notificações como lidas
   */
  async markAllAsRead(): Promise<number> {
    try {
      const result = await TagChangeNotification.updateMany(
        { isRead: false },
        { $set: { isRead: true } }
      )

      logger.info(`${result.modifiedCount} notificações marcadas como lidas`)
      return result.modifiedCount
    } catch (error) {
      logger.error('Erro ao marcar todas como lidas', { error })
      throw error
    }
  }

  /**
   * Estatísticas de notificações
   */
  async getStats(): Promise<{
    total: number
    unread: number
    byType: { added: number; removed: number }
  }> {
    try {
      const [total, unread, addedCount, removedCount] = await Promise.all([
        TagChangeNotification.countDocuments(),
        TagChangeNotification.countDocuments({ isRead: false }),
        TagChangeNotification.countDocuments({ changeType: 'ADDED' }),
        TagChangeNotification.countDocuments({ changeType: 'REMOVED' }),
      ])

      return {
        total,
        unread,
        byType: {
          added: addedCount,
          removed: removedCount,
        },
      }
    } catch (error) {
      logger.error('Erro ao obter estatísticas de notificações', { error })
      throw error
    }
  }
}

export default new TagNotificationService()
