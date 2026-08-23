import mongoose, { Document, Schema } from 'mongoose'

export interface IAcPurchaseDateEventState extends Document {
  userId: mongoose.Types.ObjectId
  status: 'livre' | 'tratado' | 'claimado' | 'confirmacao-pendente'
  eventIdentity: string | null
  pendingEventIdentity: string | null
  pendingValue: string | null
  claimToken: string | null
  leaseUntil: Date | null
  claimedAt: Date | null
}

const acPurchaseDateEventStateSchema = new Schema<IAcPurchaseDateEventState>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['livre', 'tratado', 'claimado', 'confirmacao-pendente'],
      default: 'livre',
      required: true
    },
    eventIdentity: { type: String, default: null },
    pendingEventIdentity: { type: String, default: null },
    pendingValue: { type: String, default: null },
    claimToken: { type: String, default: null },
    leaseUntil: { type: Date, default: null },
    claimedAt: { type: Date, default: null }
  },
  { timestamps: true, collection: 'acpurchasedateeventstates' }
)

acPurchaseDateEventStateSchema.index({ userId: 1 }, { unique: true })

const AcPurchaseDateEventState = (mongoose.models.AcPurchaseDateEventState ||
  mongoose.model<IAcPurchaseDateEventState>(
    'AcPurchaseDateEventState',
    acPurchaseDateEventStateSchema
  )) as mongoose.Model<IAcPurchaseDateEventState>

export default AcPurchaseDateEventState
