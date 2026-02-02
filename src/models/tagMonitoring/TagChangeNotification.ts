import mongoose, { Document, Schema } from 'mongoose'
import { TagPriority } from './CriticalTag'

/**
 * Interface para Notificações de Mudanças em Tags Críticas
 * Notificações agrupadas por tag
 */
export interface ITagChangeNotification extends Document {
  tagName: string
  priority: TagPriority
  changeType: 'ADDED' | 'REMOVED'
  affectedCount: number
  weekNumber: number
  year: number
  isRead: boolean
  createdAt: Date
  detailsIds: mongoose.Types.ObjectId[]
}

const TagChangeNotificationSchema = new Schema<ITagChangeNotification>(
  {
    tagName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ['CRITICAL', 'MEDIUM', 'LOW'],
      default: 'LOW',
      required: true,
      index: true,
    },
    changeType: {
      type: String,
      enum: ['ADDED', 'REMOVED'],
      required: true,
    },
    affectedCount: {
      type: Number,
      required: true,
      min: 0,
    },
    weekNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 53,
    },
    year: {
      type: Number,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    detailsIds: {
      type: [Schema.Types.ObjectId],
      ref: 'TagChangeDetail',
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'tag_change_notifications',
  }
)

// Índices
TagChangeNotificationSchema.index({ isRead: 1, createdAt: -1 })
TagChangeNotificationSchema.index(
  { tagName: 1, changeType: 1, weekNumber: 1, year: 1 },
  { unique: true }
)

// Virtual para popular detalhes
TagChangeNotificationSchema.virtual('details', {
  ref: 'TagChangeDetail',
  localField: '_id',
  foreignField: 'notificationId',
})

// Métodos de instância
TagChangeNotificationSchema.methods.markAsRead = async function () {
  this.isRead = true
  return this.save()
}

TagChangeNotificationSchema.methods.markAsUnread = async function () {
  this.isRead = false
  return this.save()
}

// Métodos estáticos
TagChangeNotificationSchema.statics.findUnread = async function (limit: number = 50) {
  // Buscar notificações não lidas e ordenar por prioridade
  const notifications = await this.find({ isRead: false }).lean()

  // Ordenar: CRITICAL > MEDIUM > LOW, depois por data
  const priorityOrder: Record<string, number> = { CRITICAL: 1, MEDIUM: 2, LOW: 3 }
  notifications.sort((a: any, b: any) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return notifications.slice(0, limit)
}

TagChangeNotificationSchema.statics.getUnreadCount = async function (): Promise<number> {
  return this.countDocuments({ isRead: false })
}

TagChangeNotificationSchema.statics.findByWeek = async function (weekNumber: number, year: number) {
  const notifications = await this.find({ weekNumber, year }).lean()

  // Ordenar por prioridade e data
  const priorityOrder: Record<string, number> = { CRITICAL: 1, MEDIUM: 2, LOW: 3 }
  notifications.sort((a: any, b: any) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return notifications
}

TagChangeNotificationSchema.statics.findByTag = function (tagName: string) {
  return this.find({ tagName }).sort({ createdAt: -1 })
}

// Configurar virtuals no toJSON e toObject
TagChangeNotificationSchema.set('toJSON', { virtuals: true })
TagChangeNotificationSchema.set('toObject', { virtuals: true })

const TagChangeNotification = mongoose.model<ITagChangeNotification>(
  'TagChangeNotification',
  TagChangeNotificationSchema
)

export default TagChangeNotification
