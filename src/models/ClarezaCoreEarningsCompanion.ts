import { Schema, model, type HydratedDocument } from 'mongoose'

export interface IClarezaCoreEarningsCompanion {
  generationId: string
  ticker: string
  createdAt: Date
  events: unknown[]
  failures: unknown[]
}

export type ClarezaCoreEarningsCompanionDocument = HydratedDocument<IClarezaCoreEarningsCompanion>

const schema = new Schema<IClarezaCoreEarningsCompanion>({
  generationId: { type: String, required: true, immutable: true },
  ticker: { type: String, required: true, immutable: true },
  createdAt: { type: Date, required: true, immutable: true },
  events: { type: [Schema.Types.Mixed], default: [] },
  failures: { type: [Schema.Types.Mixed], default: [] },
}, { timestamps: false })

schema.index({ generationId: 1, ticker: 1 }, { unique: true })

export default model<IClarezaCoreEarningsCompanion>('ClarezaCoreEarningsCompanion', schema)
