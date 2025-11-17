// src/models/IdsDiferentes.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface IIdsDiferentes extends Document {
  email: string
  previousDiscordIds: string[]
  newDiscordId: string
  detectedAt: Date
}

const IdsDiferentesSchema = new Schema<IIdsDiferentes>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
    },
    previousDiscordIds: {
      type: [String],
      default: [],
    },
    newDiscordId: {
      type: String,
      required: true,
      trim: true,
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'idsDiferentes',
  }
)

// Índices para melhor performance
IdsDiferentesSchema.index({ email: 1 })
IdsDiferentesSchema.index({ detectedAt: -1 })

const IdsDiferentes = mongoose.model<IIdsDiferentes>('IdsDiferentes', IdsDiferentesSchema)

export default IdsDiferentes

