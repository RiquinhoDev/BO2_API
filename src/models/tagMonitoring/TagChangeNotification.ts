import mongoose, { Document, Schema } from 'mongoose'

/**
 * Interface para Notificações de Mudanças em Tags Críticas
 * Notificações agrupadas por tag
 */
export interface ITagChangeNotification extends Document {
  tagName: string
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
TagChangeNotificationSchema.statics.findUnread = function (limit: number = 50) {
  return this.find({ isRead: false }).sort({ createdAt: -1 }).limit(limit)
}

TagChangeNotificationSchema.statics.getUnreadCount = async function (): Promise<number> {
  return this.countDocuments({ isRead: false })
}

TagChangeNotificationSchema.statics.findByWeek = function (weekNumber: number, year: number) {
  return this.find({ weekNumber, year }).sort({ createdAt: -1 })
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
