import mongoose, { Document, Schema } from 'mongoose'

export type ActiveCampaignExecutionOperation = 'test-cron' | 'tag-rules-only'
export type ActiveCampaignExecutionStatus = 'running' | 'completed' | 'failed'

export interface IActiveCampaignExecution extends Document {
  operation: ActiveCampaignExecutionOperation
  requestId: string
  ownerId: string
  status: ActiveCampaignExecutionStatus
  startedAt: Date
  finishedAt?: Date
  leaseExpiresAt?: Date
  result?: unknown
}

const ActiveCampaignExecutionSchema = new Schema<IActiveCampaignExecution>(
  {
    operation: {
      type: String,
      enum: ['test-cron', 'tag-rules-only'],
      required: true,
    },
    requestId: { type: String, required: true },
    ownerId: { type: String, required: true },
    status: {
      type: String,
      enum: ['running', 'completed', 'failed'],
      required: true,
    },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    leaseExpiresAt: { type: Date },
    result: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
)

ActiveCampaignExecutionSchema.index({ operation: 1 }, { unique: true })

export default mongoose.models.ActiveCampaignExecution
  || mongoose.model<IActiveCampaignExecution>('ActiveCampaignExecution', ActiveCampaignExecutionSchema)
