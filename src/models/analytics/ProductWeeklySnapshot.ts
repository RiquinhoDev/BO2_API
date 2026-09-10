import mongoose, { Document, Schema } from 'mongoose'

export interface IProductWeeklySnapshot extends Document {
  productId: mongoose.Types.ObjectId
  isoWeek: string
  scoreVersion: string
  profileKey: string
  score: number | null
  learnerCount: number
  eligibleLearnerCount: number
  coverage: number
  distribution: Record<string, unknown>
  experimental: true
  createdAt: Date
  updatedAt: Date
}

const productWeeklySnapshotSchema = new Schema<IProductWeeklySnapshot>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  isoWeek: { type: String, required: true },
  scoreVersion: { type: String, required: true },
  profileKey: { type: String, required: true },
  score: { type: Number, min: 0, max: 100, default: null },
  learnerCount: { type: Number, min: 0, required: true },
  eligibleLearnerCount: { type: Number, min: 0, required: true },
  coverage: { type: Number, min: 0, max: 100, required: true },
  distribution: { type: Schema.Types.Mixed, required: true },
  experimental: {
    type: Boolean,
    required: true,
    validate: {
      validator: (value: boolean) => value === true,
      message: 'experimental must be true',
    },
  },
}, { timestamps: true })

productWeeklySnapshotSchema.index(
  { productId: 1, isoWeek: 1, scoreVersion: 1 },
  { unique: true, name: 'product_week_score_version_unique' },
)

const ProductWeeklySnapshot = (mongoose.models.ProductWeeklySnapshot ||
  mongoose.model<IProductWeeklySnapshot>('ProductWeeklySnapshot', productWeeklySnapshotSchema)) as mongoose.Model<IProductWeeklySnapshot>

export default ProductWeeklySnapshot
