import mongoose, { type Document, Schema, model } from 'mongoose'

export type ClarezaRefreshExecutionOperation =
  | 'market'
  | 'top10'
  | 'raiox'
  | 'carteira'
  | 'earnings'
  | 'comparador'
export type ClarezaRefreshExecutionStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'indeterminate'
export type ClarezaRefreshProviderStatus = 'not-started' | 'succeeded' | 'unknown'

export interface IClarezaRefreshExecutionReceipt extends Document {
  operation: ClarezaRefreshExecutionOperation
  identity: string
  fingerprint: string
  requestId: string
  ownerId: string
  status: ClarezaRefreshExecutionStatus
  providerStatus: ClarezaRefreshProviderStatus
  startedAt: Date
  finishedAt?: Date
  leaseExpiresAt?: Date
  result?: unknown
}

const ClarezaRefreshExecutionReceiptSchema = new Schema<IClarezaRefreshExecutionReceipt>({
  operation: {
    type: String,
    enum: ['market', 'top10', 'raiox', 'carteira', 'earnings', 'comparador'],
    required: true,
  },
  identity: { type: String, required: true },
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
  collection: 'clareza_refresh_execution_receipts',
  timestamps: true,
})

ClarezaRefreshExecutionReceiptSchema.index(
  { operation: 1, requestId: 1 },
  { unique: true, name: 'clareza_refresh_execution_operation_request_id_unique' },
)
ClarezaRefreshExecutionReceiptSchema.index(
  { operation: 1, identity: 1, fingerprint: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['running', 'indeterminate'] } },
    name: 'clareza_refresh_execution_active_fingerprint_unique',
  },
)

export default mongoose.models.ClarezaRefreshExecutionReceipt
  || model<IClarezaRefreshExecutionReceipt>(
    'ClarezaRefreshExecutionReceipt',
    ClarezaRefreshExecutionReceiptSchema,
  )
