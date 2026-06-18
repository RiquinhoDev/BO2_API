import mongoose, { Schema, Document } from 'mongoose'

export interface IClarezaRaioxData extends Document {
  fetchedAt: Date
  stockCount: number
  errors: number
  sectorPe: any[]
  // Mapa { TICKER: payloadRico } — payload no mesmo formato de chaves curtas do raiox
  stocks: Record<string, any>
}

const ClarezaRaioxDataSchema = new Schema<IClarezaRaioxData>(
  {
    fetchedAt:  { type: Date, default: Date.now, index: true },
    stockCount: { type: Number, required: true },
    errors:     { type: Number, default: 0 },
    sectorPe:   { type: Schema.Types.Mixed, default: [] },
    stocks:     { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: false }
)

export default mongoose.model<IClarezaRaioxData>('ClarezaRaioxData', ClarezaRaioxDataSchema)
