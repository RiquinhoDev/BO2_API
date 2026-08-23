// Estado interno do escritor da expiração da ActiveCampaign.
// Um documento por aluno guarda o último ciclo de acesso observado;
// nunca depende dos campos da AC para reconhecer um evento novo.

import mongoose, { Document, Schema } from 'mongoose'

export interface IAcExpirationEventState extends Document {
  userId: mongoose.Types.ObjectId
  status: 'livre' | 'tratado' | 'claimado' | 'finalizacao-pendente' | 'confirmacao-pendente'
  eventIdentity: string | null
  saleIdentity: string | null
  anchorDate: Date | null
  cycleYears: 1 | 2 | null
  handledAt: Date | null
  claimToken: string | null
  leaseUntil: Date | null
  claimedAt: Date | null
  pendingEventIdentity: string | null
  pendingSaleIdentity: string | null
  pendingAnchorDate: Date | null
  pendingCycleYears: 1 | 2 | null
  pendingExpiration: Date | null
  pendingReason: 'bootstrap' | 'already-right' | 'would-shorten' | 'external-write' | null
  createdAt: Date
  updatedAt: Date
}

const acExpirationEventStateSchema = new Schema<IAcExpirationEventState>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: {
      type: String,
      enum: ['livre', 'tratado', 'claimado', 'finalizacao-pendente', 'confirmacao-pendente'],
      default: 'tratado',
      required: true
    },
    eventIdentity: { type: String, default: null },
    saleIdentity: { type: String, default: null },
    anchorDate: { type: Date, default: null },
    cycleYears: { type: Number, enum: [1, 2], default: null },
    handledAt: { type: Date, default: null },
    claimToken: { type: String, default: null },
    leaseUntil: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
    pendingEventIdentity: { type: String, default: null },
    pendingSaleIdentity: { type: String, default: null },
    pendingAnchorDate: { type: Date, default: null },
    pendingCycleYears: { type: Number, enum: [1, 2], default: null },
    pendingExpiration: { type: Date, default: null },
    pendingReason: {
      type: String,
      enum: ['bootstrap', 'already-right', 'would-shorten', 'external-write'],
      default: null
    }
  },
  { timestamps: true, collection: 'acexpirationeventstates' }
)

const AcExpirationEventState = (mongoose.models.AcExpirationEventState ||
  mongoose.model<IAcExpirationEventState>(
    'AcExpirationEventState',
    acExpirationEventStateSchema
  )) as mongoose.Model<IAcExpirationEventState>

export default AcExpirationEventState
