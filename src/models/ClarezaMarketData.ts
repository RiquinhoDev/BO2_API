import mongoose, { Schema, Document } from 'mongoose'

export interface IClarezaMarketData extends Document {
  fetchedAt: Date
  stockCount: number
  errors: number
  stocks: any[]
}

const ClarezaMarketDataSchema = new Schema<IClarezaMarketData>(
  {
    fetchedAt:  { type: Date, default: Date.now, index: true },
    stockCount: { type: Number, required: true },
    errors:     { type: Number, default: 0 },
    stocks:     { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: false }
)

export default mongoose.model<IClarezaMarketData>('ClarezaMarketData', ClarezaMarketDataSchema)
