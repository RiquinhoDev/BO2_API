import mongoose, { type Document, Schema, model } from 'mongoose'

export type ActiveCampaignProductTagReceiptOperation = 'apply' | 'remove' | 'sync'
export type ActiveCampaignProductTagReceiptStatus =
  'running' | 'completed' | 'failed' | 'indeterminate'
export type ActiveCampaignProductTagProviderStatus = 'not-started' | 'succeeded' | 'unknown'

export interface IActiveCampaignProductTagReceipt extends Document {
  operation: ActiveCampaignProductTagReceiptOperation
  identity: string
  requestId: string
  ownerId: string
  status: ActiveCampaignProductTagReceiptStatus
  providerStatus: ActiveCampaignProductTagProviderStatus
  startedAt: Date
  finishedAt?: Date
  leaseExpiresAt?: Date
  result?: unknown
}

const ActiveCampaignProductTagReceiptSchema = new Schema<IActiveCampaignProductTagReceipt>({
  operation: {
    type: String,
    enum: ['apply', 'remove', 'sync'],
    required: true,
  },
  identity: { type: String, required: true },
  requestId: { type: String, required: true },
  ownerId: { type: String, required: true },
  status: {
    type: String,
    enum: ['running', 'completed', 'failed', 'indeterminate'],
    required: true,
  },
  providerStatus: {
    type: String,
    enum: ['not-started', 'succeeded', 'unknown'],
    required: true,
  },
  startedAt: { type: Date, required: true },
  finishedAt: { type: Date },
  leaseExpiresAt: { type: Date },
  result: { type: Schema.Types.Mixed },
}, {
  collection: 'active_campaign_product_tag_receipts',
  timestamps: true,
})

ActiveCampaignProductTagReceiptSchema.index(
  { operation: 1, identity: 1, requestId: 1 },
  { unique: true },
)
ActiveCampaignProductTagReceiptSchema.index(
  { operation: 1, identity: 1 },
  { unique: true, partialFilterExpression: { status: 'running' } },
)

export default mongoose.models.ActiveCampaignProductTagReceipt
  || model<IActiveCampaignProductTagReceipt>(
    'ActiveCampaignProductTagReceipt',
    ActiveCampaignProductTagReceiptSchema,
  )
