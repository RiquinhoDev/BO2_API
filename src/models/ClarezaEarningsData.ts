import mongoose, { Schema } from 'mongoose'
import type { ClarezaEarningsPayload } from '../types/clareza.types'

export interface IClarezaEarningsData {
  fetchedAt: Date
  itemCount: number
  errors: number
  earnings: ClarezaEarningsPayload
}

const ClarezaEarningsDataSchema = new Schema<IClarezaEarningsData>(
  {
    fetchedAt: { type: Date, default: Date.now, index: true },
    itemCount: { type: Number, required: true },
    errors: { type: Number, default: 0 },
    earnings: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: false, suppressReservedKeysWarning: true }
)

export default mongoose.model<IClarezaEarningsData>('ClarezaEarningsData', ClarezaEarningsDataSchema)
