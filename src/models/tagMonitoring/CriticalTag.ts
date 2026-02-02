import mongoose, { Document, Schema } from 'mongoose'

/**
 * Níveis de prioridade para tags monitorizadas
 */
export type TagPriority = 'CRITICAL' | 'MEDIUM' | 'LOW'

/**
 * Interface para Tags Críticas
 * Tags marcadas para monitorização semanal de mudanças
 */
export interface ICriticalTag extends Document {
  tagName: string
  priority: TagPriority
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
    priority: {
      type: String,
      enum: ['CRITICAL', 'MEDIUM', 'LOW'],
      default: 'LOW',
      required: true,
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
  // Ordena por prioridade (CRITICAL > MEDIUM > LOW) e depois por nome
  const priorityOrder: Record<TagPriority, number> = { CRITICAL: 1, MEDIUM: 2, LOW: 3 }
  return this.find({ isActive: true }).then((tags) =>
    tags.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      return a.tagName.localeCompare(b.tagName)
    })
  )
}

CriticalTagSchema.statics.isCritical = async function (tagName: string): Promise<boolean> {
  const tag = await this.findOne({ tagName, isActive: true })
  return !!tag
}

CriticalTagSchema.statics.getPriorityLevel = async function (
  tagName: string
): Promise<TagPriority | null> {
  const tag = await this.findOne({ tagName, isActive: true })
  return tag?.priority || null
}

const CriticalTag = mongoose.model<ICriticalTag>('CriticalTag', CriticalTagSchema)

export default CriticalTag
