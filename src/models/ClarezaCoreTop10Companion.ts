import { Schema, model, type HydratedDocument } from 'mongoose'

export interface IClarezaCoreTop10Companion {
  generationId: string
  ticker: string
  createdAt: Date
  points: unknown[]
  failures: unknown[]
}

export type ClarezaCoreTop10CompanionDocument = HydratedDocument<IClarezaCoreTop10Companion>

const schema = new Schema<IClarezaCoreTop10Companion>({
  generationId: { type: String, required: true, immutable: true },
  ticker: { type: String, required: true, immutable: true },
  createdAt: { type: Date, required: true, immutable: true },
  points: { type: [Schema.Types.Mixed], default: [] },
  failures: { type: [Schema.Types.Mixed], default: [] },
}, { timestamps: false })

schema.index({ generationId: 1, ticker: 1 }, { unique: true })

export default model<IClarezaCoreTop10Companion>('ClarezaCoreTop10Companion', schema)
