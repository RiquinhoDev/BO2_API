// src/models/UnmatchedUser.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface IUnmatchedUser extends Document {
  discordId: string
  username?: string
  email: string
  name?: string
  detectedAt: Date
}

const UnmatchedUserSchema = new Schema<IUnmatchedUser>(
  {
    discordId: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'unmatchedUsers',
  }
)

// Índices para melhor performance
UnmatchedUserSchema.index({ email: 1 })
UnmatchedUserSchema.index({ discordId: 1 })
UnmatchedUserSchema.index({ detectedAt: -1 })

const UnmatchedUser = mongoose.model<IUnmatchedUser>('UnmatchedUser', UnmatchedUserSchema)

export default UnmatchedUser

