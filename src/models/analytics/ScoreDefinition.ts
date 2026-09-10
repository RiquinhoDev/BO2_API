import mongoose, { Document, Schema } from 'mongoose'

export interface IScoreDefinition extends Document {
  profileKey: string
  version: string
  experimental: true
  enabled: false
  minimumCoverage: number
  dimensions: Record<string, unknown>[]
  createdAt: Date
  updatedAt: Date
}

const scoreDefinitionSchema = new Schema<IScoreDefinition>({
  profileKey: { type: String, required: true },
  version: { type: String, required: true },
  experimental: {
    type: Boolean,
    required: true,
    validate: {
      validator: (value: boolean) => value === true,
      message: 'experimental must be true',
    },
  },
  enabled: {
    type: Boolean,
    required: true,
    validate: {
      validator: (value: boolean) => value === false,
      message: 'enabled must be false',
    },
  },
  minimumCoverage: { type: Number, min: 0, max: 100, required: true },
  dimensions: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true })

scoreDefinitionSchema.index(
  { profileKey: 1, version: 1 },
  { unique: true, name: 'score_profile_version_unique' },
)

const ScoreDefinition = (mongoose.models.ScoreDefinition ||
  mongoose.model<IScoreDefinition>('ScoreDefinition', scoreDefinitionSchema)) as mongoose.Model<IScoreDefinition>

export default ScoreDefinition
