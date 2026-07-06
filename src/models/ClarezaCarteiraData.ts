import mongoose, { Schema } from 'mongoose'

export interface IClarezaCarteiraData {
  fetchedAt: Date
  itemCount: number
  errors: number
  items: any[]
}

const ClarezaCarteiraDataSchema = new Schema<IClarezaCarteiraData>(
  {
    fetchedAt: { type: Date, default: Date.now, index: true },
    itemCount: { type: Number, required: true },
    errors: { type: Number, default: 0 },
    items: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: false, suppressReservedKeysWarning: true }
)

export default mongoose.model<IClarezaCarteiraData>('ClarezaCarteiraData', ClarezaCarteiraDataSchema)
