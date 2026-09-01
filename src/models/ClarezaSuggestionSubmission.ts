import mongoose, { Schema } from 'mongoose'

export interface IClarezaSuggestionSubmission {
  submissionId: string
  key: string
  query: string
  requestedAt: Date
}

const ClarezaSuggestionSubmissionSchema = new Schema<IClarezaSuggestionSubmission>({
  submissionId: { type: String, required: true, unique: true, immutable: true },
  key: { type: String, required: true, immutable: true, index: true },
  query: { type: String, required: true, immutable: true },
  requestedAt: { type: Date, required: true, immutable: true, index: true },
}, {
  timestamps: false,
  strict: 'throw',
})

export default mongoose.model<IClarezaSuggestionSubmission>(
  'ClarezaSuggestionSubmission',
  ClarezaSuggestionSubmissionSchema,
)
