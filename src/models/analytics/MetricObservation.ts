import mongoose, { Document, Schema } from 'mongoose'
import type {
  DimensionKey,
  ObservationQuality,
  ProviderKey,
} from '../../services/analytics/productScoring/contracts'

export interface IMetricObservation extends Document {
  observationKey: string
  learnerId: mongoose.Types.ObjectId | null
  productId: mongoose.Types.ObjectId
  provider: ProviderKey
  metricKey: string
  dimension: DimensionKey
  normalizedValue: number | null
  nativeValue?: unknown
  sourceIdentity: string
  sourceEventAt: Date
  collectedAt: Date
  quality: ObservationQuality
  adapterVersion: string
  createdAt: Date
  updatedAt: Date
}

const metricObservationSchema = new Schema<IMetricObservation>({
  observationKey: { type: String, required: true },
  learnerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  provider: { type: String, enum: ['hotmart', 'curseduca', 'guru'], required: true },
  metricKey: { type: String, required: true },
  dimension: { type: String, enum: ['activation', 'engagement', 'journey', 'consistency', 'retention', 'commercial'], required: true },
  normalizedValue: { type: Number, min: 0, max: 100, default: null },
  nativeValue: { type: Schema.Types.Mixed, select: false },
  sourceIdentity: { type: String, required: true },
  sourceEventAt: { type: Date, required: true },
  collectedAt: { type: Date, required: true },
  quality: { type: String, enum: ['observed', 'missing', 'stale', 'invalid', 'not_supported'], required: true },
  adapterVersion: { type: String, required: true },
}, { timestamps: true })

metricObservationSchema.pre('validate', function validateObservedValue(next) {
  const valid = this.quality === 'observed' ? this.normalizedValue !== null : this.normalizedValue === null
  next(valid ? undefined : new Error('observation quality/value mismatch'))
})

metricObservationSchema.index({ observationKey: 1 }, { unique: true, name: 'metric_observation_key_unique' })

const MetricObservation = (mongoose.models.MetricObservation ||
  mongoose.model<IMetricObservation>('MetricObservation', metricObservationSchema)) as mongoose.Model<IMetricObservation>

export default MetricObservation
