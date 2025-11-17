// src/models/StudentClassHistory.ts - VERSÃO CORRIGIDA
import mongoose, { Document, Schema } from 'mongoose'

export interface IStudentClassHistory extends Document {
  studentId: mongoose.Types.ObjectId
  classId: string
  className: string
  dateMoved: Date
  reason?: string
  movedBy?: string // ID do usuário que fez a movimentação
  previousClassId?: string
  previousClassName?: string
}

const studentClassHistorySchema = new Schema<IStudentClassHistory>({
  studentId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  classId: {
    type: String,
    required: true,
    index: true
  },
  className: {
    type: String,
    required: true
  },
  dateMoved: {
    type: Date,
    default: Date.now,
    index: true
  },
  reason: {
    type: String,
    default: 'Movimentação manual'
  },
  movedBy: {
    type: String // Pode ser um ID de usuário admin
  },
  previousClassId: {
    type: String
  },
  previousClassName: {
    type: String
  }
}, {
  timestamps: true,
  collection: 'studentclasshistories'
})

// Índices para performance
studentClassHistorySchema.index({ studentId: 1, dateMoved: -1 })
studentClassHistorySchema.index({ classId: 1, dateMoved: -1 })

// ✅ FIX: Verificar se o modelo já existe antes de criar
const StudentClassHistory = mongoose.models.StudentClassHistory || 
  mongoose.model<IStudentClassHistory>('StudentClassHistory', studentClassHistorySchema)

export default StudentClassHistory