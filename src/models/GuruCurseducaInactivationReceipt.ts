import mongoose, { type Document, Schema, model } from 'mongoose'

export type GuruCurseducaInactivationReceiptOperation = 'target' | 'bulk'
export type GuruCurseducaInactivationReceiptStatus =
  'running' | 'completed' | 'failed' | 'indeterminate'
export type GuruCurseducaInactivationProviderStatus = 'not-started' | 'succeeded' | 'unknown'

export interface IGuruCurseducaInactivationReceipt extends Document {
  operation: GuruCurseducaInactivationReceiptOperation
  identity: string
  requestId: string
  ownerId: string
  status: GuruCurseducaInactivationReceiptStatus
  providerStatus: GuruCurseducaInactivationProviderStatus
  startedAt: Date
  finishedAt?: Date
  leaseExpiresAt?: Date
  result?: unknown
}

const GuruCurseducaInactivationReceiptSchema = new Schema<IGuruCurseducaInactivationReceipt>({
  operation: {
    type: String,
    enum: ['target', 'bulk'],
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
  collection: 'guru_curseduca_inactivation_receipts',
  timestamps: true,
})

GuruCurseducaInactivationReceiptSchema.index(
  { operation: 1, identity: 1, requestId: 1 },
  { unique: true },
)
GuruCurseducaInactivationReceiptSchema.index(
  { operation: 1, requestId: 1 },
  {
    unique: true,
    name: 'guru_curseduca_inactivation_operation_request_id_unique',
  },
)
GuruCurseducaInactivationReceiptSchema.index(
  { operation: 1, identity: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['running', 'indeterminate'] } },
  },
)

export default mongoose.models.GuruCurseducaInactivationReceipt
  || model<IGuruCurseducaInactivationReceipt>(
    'GuruCurseducaInactivationReceipt',
    GuruCurseducaInactivationReceiptSchema,
  )
