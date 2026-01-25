import mongoose, { Document, Schema } from 'mongoose'

/**
 * Interface para Snapshot Semanal de Tags Nativas
 * Captura das tags nativas da ActiveCampaign 1x por semana
 */
export interface IWeeklyNativeTagSnapshot extends Document {
  email: string
  userId: mongoose.Types.ObjectId
  nativeTags: string[]
  capturedAt: Date
  weekNumber: number
  year: number
  compareWith(previousSnapshot: IWeeklyNativeTagSnapshot): TagChanges
}

export interface TagChanges {
  added: string[]
  removed: string[]
  unchanged: string[]
}

const WeeklyNativeTagSnapshotSchema = new Schema<IWeeklyNativeTagSnapshot>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    nativeTags: {
      type: [String],
      default: [],
    },
    capturedAt: {
      type: Date,
      required: true,
      default: Date.now,
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
  },
  {
    timestamps: false, // Não precisamos de timestamps automáticos
    collection: 'weekly_native_tag_snapshots',
  }
)

// Índices
WeeklyNativeTagSnapshotSchema.index({ email: 1, capturedAt: -1 })
WeeklyNativeTagSnapshotSchema.index({ weekNumber: 1, year: 1 })

// TTL Index - Remove automaticamente após 6 meses (15778800 segundos)
WeeklyNativeTagSnapshotSchema.index({ capturedAt: 1 }, { expireAfterSeconds: 15778800 })

// Método para comparar com snapshot anterior
WeeklyNativeTagSnapshotSchema.methods.compareWith = function (
  previousSnapshot: IWeeklyNativeTagSnapshot
): TagChanges {
  const currentTags = new Set(this.nativeTags)
  const previousTags = new Set(previousSnapshot?.nativeTags || [])

  const added = this.nativeTags.filter((tag) => !previousTags.has(tag))
  const removed = (previousSnapshot?.nativeTags || []).filter((tag) => !currentTags.has(tag))
  const unchanged = this.nativeTags.filter((tag) => previousTags.has(tag))

  return {
    added,
    removed,
    unchanged,
  }
}

// Métodos estáticos
WeeklyNativeTagSnapshotSchema.statics.findByEmail = function (
  email: string,
  limit: number = 10
) {
  return this.find({ email }).sort({ capturedAt: -1 }).limit(limit)
}

WeeklyNativeTagSnapshotSchema.statics.findByWeek = function (weekNumber: number, year: number) {
  return this.find({ weekNumber, year })
}

WeeklyNativeTagSnapshotSchema.statics.findPreviousSnapshot = async function (
  email: string,
  currentWeek: number,
  currentYear: number
) {
  // Calcular semana anterior
  let previousWeek = currentWeek - 1
  let previousYear = currentYear

  if (previousWeek < 1) {
    previousWeek = 52
    previousYear = currentYear - 1
  }

  return this.findOne({
    email,
    weekNumber: previousWeek,
    year: previousYear,
  })
}

const WeeklyNativeTagSnapshot = mongoose.model<IWeeklyNativeTagSnapshot>(
  'WeeklyNativeTagSnapshot',
  WeeklyNativeTagSnapshotSchema
)

export default WeeklyNativeTagSnapshot
