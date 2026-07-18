import mongoose, { Document, Schema } from 'mongoose'

/**
 * Interface para Detalhes de Mudanças em Tags
 * Detalhes individuais por aluno afetado
 */
export interface ITagChangeDetail extends Document {
  notificationId: mongoose.Types.ObjectId
  email: string
  userName: string
  product: string
  class?: string
  currentTags: string[]
  detectedAt: Date
}

export interface ITagChangeDetailModel extends mongoose.Model<ITagChangeDetail> {
  findByNotification(notificationId: string): Promise<ITagChangeDetail[]>
  findByEmail(email: string, limit?: number): Promise<ITagChangeDetail[]>
  findByProduct(product: string): Promise<ITagChangeDetail[]>
}

const TagChangeDetailSchema = new Schema<
  ITagChangeDetail,
  ITagChangeDetailModel
>(
  {
    notificationId: {
      type: Schema.Types.ObjectId,
      ref: 'TagChangeNotification',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    product: {
      type: String,
      required: true,
      trim: true,
    },
    class: {
      type: String,
      trim: true,
    },
    currentTags: {
      type: [String],
      default: [],
    },
    detectedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    collection: 'tag_change_details',
  }
)

// Índices
TagChangeDetailSchema.index({ notificationId: 1 })
TagChangeDetailSchema.index({ email: 1 })
TagChangeDetailSchema.index({ detectedAt: -1 })

// Métodos estáticos
TagChangeDetailSchema.statics.findByNotification = function (notificationId: string) {
  return this.find({ notificationId }).sort({ email: 1 })
}

TagChangeDetailSchema.statics.findByEmail = function (email: string, limit: number = 50) {
  return this.find({ email }).sort({ detectedAt: -1 }).limit(limit)
}

TagChangeDetailSchema.statics.findByProduct = function (product: string) {
  return this.find({ product }).sort({ detectedAt: -1 })
}

const TagChangeDetail = mongoose.model<ITagChangeDetail, ITagChangeDetailModel>(
  'TagChangeDetail',
  TagChangeDetailSchema
)

export default TagChangeDetail
