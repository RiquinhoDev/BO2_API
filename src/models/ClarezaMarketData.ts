import mongoose, { Schema, type HydratedDocument } from 'mongoose'

export interface IClarezaMarketData {
  fetchedAt: Date
  stockCount: number
  errors: number
  stocks: any[]
}

export type ClarezaMarketDataDocument =
  HydratedDocument<IClarezaMarketData>

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
