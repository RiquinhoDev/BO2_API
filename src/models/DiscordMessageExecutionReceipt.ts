import mongoose, { type Document, Schema, model } from 'mongoose'

export type DiscordMessageExecutionOperation =
  | 'manual-send'
  | 'scheduled-test'
  | 'scheduled-run'
  | 'scheduled-rule'
export type DiscordMessageExecutionStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'indeterminate'
export type DiscordMessageProviderStatus = 'not-started' | 'succeeded' | 'unknown'

export interface IDiscordMessageExecutionReceipt extends Document {
  operation: DiscordMessageExecutionOperation
  identity: string
  requestId: string
  ownerId: string
  status: DiscordMessageExecutionStatus
  providerStatus: DiscordMessageProviderStatus
  startedAt: Date
  finishedAt?: Date
  leaseExpiresAt?: Date
  result?: unknown
}

const DiscordMessageExecutionReceiptSchema = new Schema<IDiscordMessageExecutionReceipt>({
  operation: {
    type: String,
    enum: ['manual-send', 'scheduled-test', 'scheduled-run', 'scheduled-rule'],
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
  collection: 'discord_message_execution_receipts',
  timestamps: true,
})

DiscordMessageExecutionReceiptSchema.index(
  { operation: 1, requestId: 1 },
  { unique: true, name: 'discord_message_execution_operation_request_id_unique' },
)
DiscordMessageExecutionReceiptSchema.index(
  { operation: 1, identity: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['running', 'indeterminate'] } },
    name: 'discord_message_execution_active_identity_unique',
  },
)

export default mongoose.models.DiscordMessageExecutionReceipt
  || model<IDiscordMessageExecutionReceipt>(
    'DiscordMessageExecutionReceipt',
    DiscordMessageExecutionReceiptSchema,
  )
