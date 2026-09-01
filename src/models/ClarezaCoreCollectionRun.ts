import mongoose, { Schema } from 'mongoose'

export interface IClarezaCoreRunFailure {
  key: string
  errorCode: string
}

export interface IClarezaCoreRunCollectedItem {
  key: string
  data: unknown
}

export interface IClarezaCoreCollectionRun {
  runId: string
  generationId: string
  universeVersion: string
  itemKeys: string[]
  status: 'pending' | 'running' | 'completed'
  nextIndex: number
  successfulItems: string[]
  collectedItems: IClarezaCoreRunCollectedItem[]
  failedItems: IClarezaCoreRunFailure[]
  ownerId: string | null
  leaseUntil: Date | null
  revision: number
  createdAt: Date
  updatedAt: Date
}

const FailureSchema = new Schema<IClarezaCoreRunFailure>({
  key: { type: String, required: true },
  errorCode: { type: String, required: true },
}, { _id: false, strict: 'throw' })

const CollectedItemSchema = new Schema<IClarezaCoreRunCollectedItem>({
  key: { type: String, required: true },
  data: { type: Schema.Types.Mixed, required: true },
}, { _id: false, strict: 'throw' })

const CollectionRunSchema = new Schema<IClarezaCoreCollectionRun>({
  runId: { type: String, required: true, unique: true, immutable: true },
  generationId: { type: String, required: true, immutable: true },
  universeVersion: { type: String, required: true, immutable: true },
  itemKeys: { type: [String], required: true, immutable: true },
  status: { type: String, enum: ['pending', 'running', 'completed'], required: true },
  nextIndex: { type: Number, required: true, min: 0 },
  successfulItems: { type: [String], required: true },
  collectedItems: { type: [CollectedItemSchema], required: true },
  failedItems: { type: [FailureSchema], required: true },
  ownerId: { type: String, default: null },
  leaseUntil: { type: Date, default: null },
  revision: { type: Number, required: true, min: 0 },
  createdAt: { type: Date, required: true, immutable: true },
  updatedAt: { type: Date, required: true },
}, { timestamps: false, strict: 'throw' })

export default mongoose.model<IClarezaCoreCollectionRun>(
  'ClarezaCoreCollectionRun',
  CollectionRunSchema,
)
