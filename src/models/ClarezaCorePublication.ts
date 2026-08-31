import mongoose, { Schema } from 'mongoose'

export interface IClarezaCorePublication {
  key: 'core'
  currentGenerationId: string
  previousGenerationId: string | null
  revision: number
  updatedAt: Date
}

const ClarezaCorePublicationSchema = new Schema<IClarezaCorePublication>({
  key: { type: String, required: true, enum: ['core'], unique: true, immutable: true },
  currentGenerationId: { type: String, required: true },
  previousGenerationId: { type: String, default: null },
  revision: { type: Number, required: true, min: 1 },
  updatedAt: { type: Date, required: true },
}, {
  timestamps: false,
  strict: 'throw',
})

export default mongoose.model<IClarezaCorePublication>(
  'ClarezaCorePublication',
  ClarezaCorePublicationSchema,
)
