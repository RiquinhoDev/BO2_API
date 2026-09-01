import { Schema, model, type HydratedDocument } from 'mongoose'

export interface IClarezaCoreRaioxCompanion {
  generationId: string
  ticker: string
  createdAt: Date
  data: unknown | null
  sectorPe: unknown[]
}

export type ClarezaCoreRaioxCompanionDocument = HydratedDocument<IClarezaCoreRaioxCompanion>

const schema = new Schema<IClarezaCoreRaioxCompanion>({
  generationId: { type: String, required: true, immutable: true },
  ticker: { type: String, required: true, immutable: true },
  createdAt: { type: Date, required: true, immutable: true },
  data: { type: Schema.Types.Mixed, default: null },
  sectorPe: { type: [Schema.Types.Mixed], default: [] },
}, { timestamps: false })

schema.index({ generationId: 1, ticker: 1 }, { unique: true })

export default model<IClarezaCoreRaioxCompanion>('ClarezaCoreRaioxCompanion', schema)
