import mongoose, { Schema } from 'mongoose'

import type { CoreAssetRecord } from '../services/clareza/core/coreGeneration.types'

export interface IClarezaCoreGeneration {
  generationId: string
  universeVersion: string
  dataVersion: string
  createdAt: Date
  recordCount: number
  records: CoreAssetRecord[]
}

const ClarezaCoreGenerationSchema = new Schema<IClarezaCoreGeneration>({
  generationId: { type: String, required: true, unique: true, immutable: true },
  universeVersion: { type: String, required: true, immutable: true },
  dataVersion: { type: String, required: true, immutable: true },
  createdAt: { type: Date, required: true, immutable: true, index: true },
  recordCount: { type: Number, required: true, immutable: true, min: 0 },
  records: { type: Schema.Types.Mixed, required: true, immutable: true },
}, {
  timestamps: false,
  strict: 'throw',
})

export default mongoose.model<IClarezaCoreGeneration>(
  'ClarezaCoreGeneration',
  ClarezaCoreGenerationSchema,
)
