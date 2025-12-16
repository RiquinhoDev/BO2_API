// src/models/UserHistory.ts - VERSÃO CORRIGIDA COMPLETA
import mongoose, { Document, Schema } from 'mongoose'

export interface IUserHistory extends Document {
  userId: mongoose.Types.ObjectId  // ✅ CORRETO na interface
  userEmail: string
  changeType: 'CLASS_CHANGE' | 'EMAIL_CHANGE' | 'MANUAL_EDIT' | 'PLATFORM_UPDATE' | 'STATUS_CHANGE' | 'INACTIVATION'
  
  // Dados da mudança
  previousValue: {
    classId?: string
    className?: string
    email?: string
    [key: string]: any // Para campos dinâmicos de plataforma
  }
  newValue: {
    classId?: string
    className?: string
    email?: string
    [key: string]: any // Para campos dinâmicos de plataforma
  }
  
  // ✅ NOVO: Suporte a plataformas
  platform?: 'hotmart' | 'curseduca' | 'discord' | 'system'
  field?: string // Campo específico que foi alterado
  action?: 'create' | 'update' | 'delete' | 'sync'
  
  // Metadados
  changeDate: Date
  timestamp?: Date // Alias para compatibilidade
  source: 'HOTMART_SYNC' | 'CURSEDUCA_SYNC' | 'MANUAL' | 'SYSTEM'
  syncId?: mongoose.Types.ObjectId // Referência ao sync que causou a mudança
  changedBy?: string // Admin que fez mudança manual
  adminId?: string // ID do admin (novo campo)
  
  // Informações adicionais
  reason?: string
  notes?: string
  metadata?: any // Dados adicionais flexíveis
}

const userHistorySchema = new Schema<IUserHistory>({
  userId: {
    type: Schema.Types.ObjectId,  // ✅ CORRETO no schema
    required: true,
    ref: 'User',
    index: true
  },
  userEmail: {
    type: String,
    required: true,
    index: true
  },
  changeType: {
    type: String,
    enum: ['CLASS_CHANGE', 'EMAIL_CHANGE', 'MANUAL_EDIT', 'PLATFORM_UPDATE', 'STATUS_CHANGE', 'INACTIVATION'],
    required: true,
    index: true
  },
  
  previousValue: {
    classId: String,
    className: String,
    email: String,
    type: Schema.Types.Mixed // Para campos dinâmicos
  },
  newValue: {
    classId: String,
    className: String,
    email: String,
    type: Schema.Types.Mixed // Para campos dinâmicos
  },
  
  // ✅ NOVOS CAMPOS para suporte multi-plataforma
  platform: {
    type: String,
    enum: ['hotmart', 'curseduca', 'discord', 'system'],
    index: true
  },
  field: String,
  action: {
    type: String,
    enum: ['create', 'update', 'delete', 'sync']
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  adminId: String,
  metadata: Schema.Types.Mixed,
  
  changeDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  source: {
    type: String,
    enum: ['HOTMART_SYNC', 'CURSEDUCA_SYNC', 'MANUAL', 'SYSTEM'],
    required: true,
    index: true
  },
  syncId: {
    type: Schema.Types.ObjectId,  // ✅ CORRETO
    ref: 'SyncHistory'
  },
  changedBy: String,
  
  reason: String,
  notes: String
}, {
  timestamps: true,
  collection: 'userhistories'
})

// Índices compostos para consultas eficientes
userHistorySchema.index({ userId: 1, changeDate: -1 })
userHistorySchema.index({ userEmail: 1, changeDate: -1 })
userHistorySchema.index({ changeType: 1, changeDate: -1 })
// ✅ NOVOS ÍNDICES para multi-plataforma
userHistorySchema.index({ platform: 1, timestamp: -1 })
userHistorySchema.index({ userId: 1, platform: 1, timestamp: -1 })

// Método estático para criar histórico de mudança de turma
userHistorySchema.statics.createClassChangeHistory = async function(
  userId: mongoose.Types.ObjectId,
  userEmail: string,
  previousClass: { classId?: string, className?: string },
  newClass: { classId?: string, className?: string },
  syncId?: mongoose.Types.ObjectId
) {
  return await this.create({
    userId,
    userEmail,
    changeType: 'CLASS_CHANGE',
    previousValue: {
      classId: previousClass.classId,
      className: previousClass.className
    },
    newValue: {
      classId: newClass.classId,
      className: newClass.className
    },
    source: 'HOTMART_SYNC',
    syncId,
    reason: 'Mudança de turma detectada na sincronização da Hotmart'
  })
}

// Método estático para criar histórico de mudança de email
userHistorySchema.statics.createEmailChangeHistory = async function(
  userId: mongoose.Types.ObjectId,
  previousEmail: string,
  newEmail: string,
  syncId?: mongoose.Types.ObjectId
) {
  return await this.create({
    userId,
    userEmail: newEmail, // Usar o novo email como referência
    changeType: 'EMAIL_CHANGE',
    previousValue: {
      email: previousEmail
    },
    newValue: {
      email: newEmail
    },
    source: 'HOTMART_SYNC',
    syncId,
    reason: 'Mudança de email detectada na sincronização da Hotmart'
  })
}

// ✅ NOVO: Método estático para criar histórico de inativação
userHistorySchema.statics.createInactivationHistory = async function(
  userId: mongoose.Types.ObjectId,
  userEmail: string,
  platforms: string[],
  reason?: string,
  performedBy?: string
) {
  return await this.create({
    userId,
    userEmail,
    changeType: 'INACTIVATION',
    previousValue: {
      status: 'ACTIVE',
      platforms: platforms
    },
    newValue: {
      status: 'INACTIVE',
      platforms: platforms,
      inactivatedAt: new Date()
    },
    source: 'MANUAL',
    changedBy: performedBy,
    reason: reason || 'Inativação manual pelo administrador',
    metadata: {
      platforms,
      inactivatedAt: new Date()
    }
  })
}

// Método para buscar histórico de um usuário
userHistorySchema.statics.getUserHistory = async function(
  userIdOrEmail: string | mongoose.Types.ObjectId,
  limit: number = 50
) {
  const query = mongoose.Types.ObjectId.isValid(userIdOrEmail as string)
    ? { userId: userIdOrEmail }
    : { userEmail: userIdOrEmail }
    
  return await this.find(query)
    .sort({ changeDate: -1 })
    .limit(limit)
    .populate('syncId', 'startTime endTime status totalUsers')
    .lean()
}

// ✅ FIX: Export com verificação de modelo existente
const UserHistory = mongoose.models.UserHistory || 
  mongoose.model<IUserHistory>('UserHistory', userHistorySchema)

export default UserHistory

// Função helper para garantir que o modelo existe
export function ensureUserHistoryModel() {
  try {
    return mongoose.model<IUserHistory>('UserHistory')
  } catch {
    return UserHistory
  }
}