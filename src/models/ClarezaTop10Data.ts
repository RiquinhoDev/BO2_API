import mongoose, { Schema, type HydratedDocument } from 'mongoose'
import type { ClarezaTop10Payload } from '../types/clareza.types'

export interface IClarezaTop10Data {
  fetchedAt: Date
  stockCount: number
  errors: number
  // Payload completo servido ao HTML: { updated, source, stocks: { TICKER: {...} } }
  payload: ClarezaTop10Payload
}

export type ClarezaTop10DataDocument =
  HydratedDocument<IClarezaTop10Data>

const ClarezaTop10DataSchema = new Schema<IClarezaTop10Data>(
  {
    fetchedAt:  { type: Date, default: Date.now, index: true },
    stockCount: { type: Number, required: true },
    errors:     { type: Number, default: 0 },
    payload:    { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: false }
)

export default mongoose.model<IClarezaTop10Data>('ClarezaTop10Data', ClarezaTop10DataSchema)
