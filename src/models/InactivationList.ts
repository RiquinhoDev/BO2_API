// src/models/InactivationList.ts - VERSÃO CORRIGIDA
import mongoose, { Document, Schema } from 'mongoose'

export interface IInactivationList extends Document {
  name: string
  description?: string
  status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REVERSED' // ✅ Adicionado EXECUTING e FAILED
  classIds: string[]
  classNames: string[]
  students: Array<{
    studentId: mongoose.Types.ObjectId
    email: string
    discordIds: string[]
    classId: string
    previousState: 'ativo' | 'inativo'
    processed?: boolean
    error?: string
  }>
  execution: { // ✅ Propriedade execution obrigatória
    startedAt?: Date
    completedAt?: Date
    executedBy?: string
    totalProcessed: number
    successCount: number
    errorCount: number
    errors?: Array<{
      studentId: mongoose.Types.ObjectId
      error: string
      timestamp: Date
    }>
  }
  reversal?: { // ✅ Propriedade reversal opcional
    reversedAt?: Date
    reversedBy?: string
    reason?: string
  }
  createdAt: Date
  updatedAt: Date
}

const inactivationListSchema = new Schema<IInactivationList>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED'], // ✅ Enum corrigido
    default: 'PENDING',
    index: true
  },
  classIds: [{
    type: String,
    required: true
  }],
  classNames: [{
    type: String,
    required: true
  }],
  students: [{
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true
    },
    discordIds: [{
      type: String,
      required: true
    }],
    classId: {
      type: String,
      required: true
    },
    previousState: {
      type: String,
      enum: ['ativo', 'inativo'],
      default: 'ativo'
    },
    processed: {
      type: Boolean,
      default: false
    },
    error: String
  }],
  execution: { // ✅ Sempre presente (obrigatório)
    startedAt: Date,
    completedAt: Date,
    executedBy: String,
    totalProcessed: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    errors: [{
      studentId: Schema.Types.ObjectId,
      error: String,
      timestamp: { type: Date, default: Date.now }
    }]
  },
  reversal: { // ✅ Opcional (só quando revertido)
    reversedAt: Date,
    reversedBy: String,
    reason: String
  }
}, {
  timestamps: true,
  collection: 'inactivationlists'
})

// Índices para performance
inactivationListSchema.index({ status: 1, createdAt: -1 })
inactivationListSchema.index({ classIds: 1 })
inactivationListSchema.index({ 'students.classId': 1 })

// Métodos de instância
inactivationListSchema.methods.canExecute = function() {
  return this.status === 'PENDING'
}

inactivationListSchema.methods.canRevert = function() {
  return this.status === 'COMPLETED'
}

inactivationListSchema.methods.markAsExecuting = function(executedBy?: string) {
  this.status = 'EXECUTING'
  this.execution.startedAt = new Date()
  if (executedBy) this.execution.executedBy = executedBy
  return this.save()
}

inactivationListSchema.methods.markAsCompleted = function(successCount: number, errorCount: number) {
  this.status = errorCount === 0 ? 'COMPLETED' : 'FAILED'
  this.execution.completedAt = new Date()
  this.execution.totalProcessed = this.students.length
  this.execution.successCount = successCount
  this.execution.errorCount = errorCount
  return this.save()
}

inactivationListSchema.methods.markAsReversed = function(reversedBy?: string, reason?: string) {
  this.status = 'REVERSED'
  this.reversal = {
    reversedAt: new Date(),
    reversedBy: reversedBy || 'sistema',
    reason: reason || 'Reversão manual'
  }
  return this.save()
}

// Métodos estáticos
inactivationListSchema.statics.findPending = function() {
  return this.find({ status: 'PENDING' }).sort({ createdAt: -1 })
}

inactivationListSchema.statics.findExecutable = function() {
  return this.find({ status: 'PENDING' })
}

inactivationListSchema.statics.findRevertible = function() {
  return this.find({ status: 'COMPLETED' })
}

export default mongoose.models.InactivationList || mongoose.model<IInactivationList>('InactivationList', inactivationListSchema)