// Estado interno do escritor da expiração da ActiveCampaign.
// Um documento por aluno guarda o último ciclo de acesso observado;
// nunca depende dos campos da AC para reconhecer um evento novo.

import mongoose, { Document, Schema } from 'mongoose'

export interface IAcExpirationEventState extends Document {
  userId: mongoose.Types.ObjectId
  eventIdentity: string
  anchorDate: Date
  anchorTransaction: string | null
  anchorOfferCode: string | null
  anchorProductId: string | null
  cycleYears: 1 | 2
  handledAt: Date
  createdAt: Date
  updatedAt: Date
}

const acExpirationEventStateSchema = new Schema<IAcExpirationEventState>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    eventIdentity: { type: String, required: true },
    anchorDate: { type: Date, required: true },
    anchorTransaction: { type: String, default: null },
    anchorOfferCode: { type: String, default: null },
    anchorProductId: { type: String, default: null },
    cycleYears: { type: Number, enum: [1, 2], required: true },
    handledAt: { type: Date, required: true, default: Date.now }
  },
  { timestamps: true, collection: 'acexpirationeventstates' }
)

const AcExpirationEventState = (mongoose.models.AcExpirationEventState ||
  mongoose.model<IAcExpirationEventState>(
    'AcExpirationEventState',
    acExpirationEventStateSchema
  )) as mongoose.Model<IAcExpirationEventState>

export default AcExpirationEventState
