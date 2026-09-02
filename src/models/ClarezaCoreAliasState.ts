import mongoose, { Schema } from 'mongoose'

import type { CoreAliasState } from '../services/clareza/core/coreAliasMaintenance'

export interface IClarezaCoreAliasState {
  readonly key: 'core'
  readonly revision: number
  readonly aliases: CoreAliasState['aliases']
  readonly processed: CoreAliasState['processed']
  readonly failures: CoreAliasState['failures']
  readonly conflicts: CoreAliasState['conflicts']
  readonly updatedAt: Date
}

const AliasSchema = new Schema({
  aliasTicker: { type: String, required: true },
  canonicalTicker: { type: String, required: true },
  instrumentId: { type: String, required: true },
  provenance: { type: String, enum: ['fmp-exchange-variants'], required: true },
  observedAt: { type: String, required: true },
}, { _id: false })

const ProcessedSchema = new Schema({
  ticker: { type: String, required: true },
  processedAt: { type: String, required: true },
}, { _id: false })

const FailureSchema = new Schema({
  ticker: { type: String, required: true },
  reason: { type: String, required: true },
  observedAt: { type: String, required: true },
}, { _id: false })

const ConflictSchema = new Schema({
  aliasTicker: { type: String, required: true },
  existingCanonicalTicker: { type: String, required: true },
  proposedCanonicalTicker: { type: String, required: true },
  observedAt: { type: String, required: true },
}, { _id: false })

const ClarezaCoreAliasStateSchema = new Schema<IClarezaCoreAliasState>({
  key: { type: String, enum: ['core'], required: true, unique: true },
  revision: { type: Number, required: true, min: 0 },
  aliases: { type: [AliasSchema], required: true, default: [] },
  processed: { type: [ProcessedSchema], required: true, default: [] },
  failures: { type: [FailureSchema], required: true, default: [] },
  conflicts: { type: [ConflictSchema], required: true, default: [] },
  updatedAt: { type: Date, required: true },
}, { collection: 'clareza_core_alias_states', versionKey: false })

export default mongoose.model<IClarezaCoreAliasState>(
  'ClarezaCoreAliasState',
  ClarezaCoreAliasStateSchema,
)
