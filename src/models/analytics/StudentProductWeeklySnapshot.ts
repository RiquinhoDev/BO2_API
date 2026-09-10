import mongoose, { Document, Schema } from 'mongoose'

export interface IStudentProductWeeklySnapshot extends Document {
  learnerId: mongoose.Types.ObjectId
  productId: mongoose.Types.ObjectId
  isoWeek: string
  scoreVersion: string
  profileKey: string
  score: number | null
  dimensions: Record<string, unknown>
  coverage: number
  freshness: 'fresh' | 'stale' | 'partial'
  experimental: true
  eligibleForRank: false
  actionState: 'indeterminate'
  reasons: string[]
  missingSignals: string[]
  createdAt: Date
  updatedAt: Date
}

const studentProductWeeklySnapshotSchema = new Schema<IStudentProductWeeklySnapshot>({
  learnerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  isoWeek: { type: String, required: true },
  scoreVersion: { type: String, required: true },
  profileKey: { type: String, required: true },
  score: { type: Number, min: 0, max: 100, default: null },
  dimensions: { type: Schema.Types.Mixed, required: true },
  coverage: { type: Number, min: 0, max: 100, required: true },
  freshness: { type: String, enum: ['fresh', 'stale', 'partial'], required: true },
  experimental: {
    type: Boolean,
    required: true,
    validate: {
      validator: (value: boolean) => value === true,
      message: 'experimental must be true',
    },
  },
  eligibleForRank: {
    type: Boolean,
    required: true,
    validate: {
      validator: (value: boolean) => value === false,
      message: 'eligibleForRank must be false',
    },
  },
  actionState: { type: String, enum: ['indeterminate'], required: true },
  reasons: { type: [String], default: [] },
  missingSignals: { type: [String], default: [] },
}, { timestamps: true })

studentProductWeeklySnapshotSchema.index(
  { learnerId: 1, productId: 1, isoWeek: 1, scoreVersion: 1 },
  { unique: true, name: 'student_product_week_score_version_unique' },
)

const StudentProductWeeklySnapshot = (mongoose.models.StudentProductWeeklySnapshot ||
  mongoose.model<IStudentProductWeeklySnapshot>('StudentProductWeeklySnapshot', studentProductWeeklySnapshotSchema)) as mongoose.Model<IStudentProductWeeklySnapshot>

export default StudentProductWeeklySnapshot
