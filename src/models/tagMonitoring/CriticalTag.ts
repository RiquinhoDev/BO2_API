import mongoose, { Document, Schema } from 'mongoose'

/**
 * Interface para Tags Críticas
 * Tags marcadas para monitorização semanal de mudanças
 */
export interface ICriticalTag extends Document {
  tagName: string
  isActive: boolean
  createdAt: Date
  createdBy: mongoose.Types.ObjectId
  description?: string
}

const CriticalTagSchema = new Schema<ICriticalTag>(
  {
    tagName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'critical_tags',
  }
)

// Índice único para tagName
CriticalTagSchema.index({ tagName: 1 }, { unique: true })

// Métodos auxiliares
CriticalTagSchema.methods.toggle = async function () {
  this.isActive = !this.isActive
  return this.save()
}

// Métodos estáticos
CriticalTagSchema.statics.findActiveTags = function () {
  return this.find({ isActive: true }).sort({ tagName: 1 })
}

CriticalTagSchema.statics.isCritical = async function (tagName: string): Promise<boolean> {
  const tag = await this.findOne({ tagName, isActive: true })
  return !!tag
}

const CriticalTag = mongoose.model<ICriticalTag>('CriticalTag', CriticalTagSchema)

export default CriticalTag
