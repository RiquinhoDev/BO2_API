import mongoose, { Schema } from 'mongoose'

export interface IClarezaComparadorData {
  fetchedAt: Date
  stockCount: number
  errors: number
  stocks: Record<string, any>
}

const ClarezaComparadorDataSchema = new Schema<IClarezaComparadorData>(
  {
    fetchedAt:  { type: Date, default: Date.now, index: true },
    stockCount: { type: Number, required: true },
    errors:     { type: Number, default: 0 },
    stocks:     { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: false, suppressReservedKeysWarning: true }
)

export default mongoose.model<IClarezaComparadorData>('ClarezaComparadorData', ClarezaComparadorDataSchema)
