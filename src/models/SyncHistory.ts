// src/models/SyncHistory.ts
import mongoose, { Schema, model, Document } from "mongoose"

export interface ISyncHistory extends Document {
  type: "hotmart" | "curseduca" | "csv"
  startedAt: Date
  completedAt?: Date
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  stats: {
    total: number
    added: number
    updated: number
    conflicts: number
    errors: number
  }
  errorDetails?: string[]
  user?: string
  metadata?: {
    fileName?: string
    fileSize?: number
    apiVersion?: string
    requestId?: string
  }
  duration?: number // em segundos
}

const syncHistorySchema = new Schema<ISyncHistory>({
  type: { 
    type: String, 
    enum: ["hotmart", "curseduca", "csv"], 
    required: true 
  },
  startedAt: { 
    type: Date, 
    default: Date.now, 
    required: true 
  },
  completedAt: { 
    type: Date 
  },
  status: { 
    type: String, 
    enum: ["pending", "running", "completed", "failed", "cancelled"], 
    default: "pending" 
  },
  stats: {
    total: { type: Number, default: 0 },
    added: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    conflicts: { type: Number, default: 0 },
    errors: { type: Number, default: 0 }
  },
  errorDetails: [{ type: String }],
  user: { type: String },
  metadata: {
    fileName: { type: String },
    fileSize: { type: Number },
    apiVersion: { type: String },
    requestId: { type: String }
  },
  duration: { type: Number }
}, {
  timestamps: true
})

// Middleware para calcular duração automaticamente
syncHistorySchema.pre('save', function() {
  if (this.completedAt && this.startedAt) {
    this.duration = Math.round((this.completedAt.getTime() - this.startedAt.getTime()) / 1000)
  }
})

// Índices para performance
syncHistorySchema.index({ type: 1, startedAt: -1 })
syncHistorySchema.index({ status: 1 })
syncHistorySchema.index({ user: 1 })

export default mongoose.models.SyncHistory || model<ISyncHistory>("SyncHistory", syncHistorySchema)