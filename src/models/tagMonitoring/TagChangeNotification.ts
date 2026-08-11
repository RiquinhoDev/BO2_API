import { boundedQueryLimit } from '../../utils/queryBounds'
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
  markAsRead(): Promise<ITagChangeNotification>
  markAsUnread(): Promise<ITagChangeNotification>
}

export interface ITagChangeNotificationModel extends mongoose.Model<ITagChangeNotification> {
  findUnread(limit?: number): Promise<ITagChangeNotification[]>
  getUnreadCount(): Promise<number>
  findByWeek(weekNumber: number, year: number, limit?: number): Promise<ITagChangeNotification[]>
  findByTag(tagName: string, limit?: number): Promise<ITagChangeNotification[]>
}

const TagChangeNotificationSchema = new Schema<
  ITagChangeNotification,
  ITagChangeNotificationModel
>(
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
  const cappedLimit = boundedQueryLimit(limit, 50)
  return this.aggregate([
    { $match: { isRead: false } },
    { $addFields: {
      priorityRank: { $switch: {
        branches: [
          { case: { $eq: ['$priority', 'CRITICAL'] }, then: 1 },
          { case: { $eq: ['$priority', 'MEDIUM'] }, then: 2 },
        ],
        default: 3,
      } },
    } },
    { $sort: { priorityRank: 1, createdAt: -1, _id: -1 } },
    { $limit: cappedLimit },
    { $project: { priorityRank: 0 } },
  ])
}

TagChangeNotificationSchema.statics.getUnreadCount = async function (): Promise<number> {
  return this.countDocuments({ isRead: false })
}

TagChangeNotificationSchema.statics.findByWeek = function (weekNumber: number, year: number, limit: number = 200) {
  const cappedLimit = boundedQueryLimit(limit, 200)
  return this.aggregate([
    { $match: { weekNumber, year } },
    { $addFields: {
      priorityRank: { $switch: {
        branches: [
          { case: { $eq: ['$priority', 'CRITICAL'] }, then: 1 },
          { case: { $eq: ['$priority', 'MEDIUM'] }, then: 2 },
        ],
        default: 3,
      } },
    } },
    { $sort: { priorityRank: 1, createdAt: -1, _id: -1 } },
    { $limit: cappedLimit },
    { $project: { priorityRank: 0 } },
  ])
}

TagChangeNotificationSchema.statics.findByTag = function (tagName: string, limit: number = 200) {
  return this.find({ tagName }).sort({ createdAt: -1, _id: -1 }).limit(boundedQueryLimit(limit, 200))
}

// Configurar virtuals no toJSON e toObject
TagChangeNotificationSchema.set('toJSON', { virtuals: true })
TagChangeNotificationSchema.set('toObject', { virtuals: true })

const TagChangeNotification = mongoose.model<
  ITagChangeNotification,
  ITagChangeNotificationModel
>(
  'TagChangeNotification',
  TagChangeNotificationSchema
)

export default TagChangeNotification
