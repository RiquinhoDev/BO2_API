import mongoose, { type Document, Schema, model } from 'mongoose'

export interface IAcWebhookReceipt extends Document {
  fingerprint: string
  status: 'processing' | 'processed'
  receivedAt: Date
  processedAt?: Date
  expiresAt: Date
}

const acWebhookReceiptSchema = new Schema<IAcWebhookReceipt>({
  fingerprint: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['processing', 'processed'], required: true },
  receivedAt: { type: Date, default: Date.now },
  processedAt: { type: Date },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    expires: 0,
  },
}, { collection: 'ac_webhook_receipts' })

const AcWebhookReceipt: mongoose.Model<IAcWebhookReceipt> =
  mongoose.models.AcWebhookReceipt || model<IAcWebhookReceipt>('AcWebhookReceipt', acWebhookReceiptSchema)

export default AcWebhookReceipt