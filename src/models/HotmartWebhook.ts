// src/models/HotmartWebhook.ts
import mongoose, { Schema, model, Document } from "mongoose"

interface IHotmartWebhook extends Document {
  event: string
  receivedAt?: Date
  product?: any
  buyer?: any
  producer?: any
  affiliates?: any[]
  commissions?: any[]
  purchase?: any
  refund?: any
  subscription?: any
  moloniInvoiceId?: number
  moloniCreditNoteId?: number
  rawData?: object
}

const hotmartWebhookSchema = new Schema<IHotmartWebhook>({
  event: String,
  receivedAt: { type: Date, default: Date.now },
  product: Schema.Types.Mixed,
  buyer: Schema.Types.Mixed,
  producer: Schema.Types.Mixed,
  affiliates: [Schema.Types.Mixed],
  commissions: [Schema.Types.Mixed],
  purchase: Schema.Types.Mixed,
  refund: Schema.Types.Mixed,
  subscription: Schema.Types.Mixed,
  moloniInvoiceId: { type: Number, default: null },
  moloniCreditNoteId: { type: Number, default: null },
  rawData: Object
})

export default mongoose.models.HotmartWebhook || model<IHotmartWebhook>("HotmartWebhook", hotmartWebhookSchema)
