import mongoose, { Document, Schema } from 'mongoose'

export type CompositeExecutionOperation = 'sync-pipeline' | 'cron-job'
export type CompositeExecutionStatus = 'running' | 'completed' | 'failed' | 'indeterminate'
export type CompositeProviderStatus = 'not-started' | 'succeeded' | 'unknown'

export interface ICompositeExecutionReceipt extends Document {
  operation: CompositeExecutionOperation
  identity: string
  actorId: string
  fingerprint: string
  requestId: string
  ownerId: string
  status: CompositeExecutionStatus
  providerStatus: CompositeProviderStatus
  startedAt: Date
  finishedAt?: Date
  leaseExpiresAt?: Date
  result?: unknown
}

const CompositeExecutionReceiptSchema = new Schema<ICompositeExecutionReceipt>({
  operation: {
    type: String,
    enum: ['sync-pipeline', 'cron-job'],
    required: true,
  },
  identity: { type: String, required: true },
  actorId: { type: String, required: true },
  fingerprint: { type: String, required: true },
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
  collection: 'composite_execution_receipts',
  timestamps: true,
})

CompositeExecutionReceiptSchema.index(
  { operation: 1, requestId: 1 },
  { unique: true, name: 'composite_execution_operation_request_id_unique' },
)
CompositeExecutionReceiptSchema.index(
  { operation: 1, identity: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['running', 'indeterminate'] } },
    name: 'composite_execution_active_identity_unique',
  },
)

export default mongoose.models.CompositeExecutionReceipt
  || mongoose.model<ICompositeExecutionReceipt>(
    'CompositeExecutionReceipt',
    CompositeExecutionReceiptSchema,
  )
