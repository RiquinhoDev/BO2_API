// ════════════════════════════════════════════════════════════
// 📁 src/models/CommunicationHistory.ts
// Modelo de CommunicationHistory - Histórico de emails/tags
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export type CommunicationStatus = 
  | 'PENDING' 
  | 'SENT' 
  | 'DELIVERED' 
  | 'OPENED' 
  | 'CLICKED' 
  | 'BOUNCED'
  | 'UNSUBSCRIBED'

export type CommunicationSource = 'AUTOMATIC' | 'MANUAL'

export interface IUserStateSnapshot {
  daysSinceLastAction?: number     // ✅ Opcional (ACTION_BASED)
  daysSinceLastLogin?: number      // ✅ ADICIONAR (LOGIN_BASED)
  currentProgress: number
  currentPhase: string
}

export interface ICommunicationHistory extends Document {
  userId: mongoose.Types.ObjectId
  courseId?: mongoose.Types.ObjectId  // Tornando opcional para compatibilidade
  productId?: mongoose.Types.ObjectId  // 🆕 V2: Ref → Product
  
  // Tag aplicada
  tagRuleId?: mongoose.Types.ObjectId  // Tornando opcional (novo sistema não usa)
  tagApplied: string
  
  // ===== NOVOS CAMPOS: RE-ENGAGEMENT =====
  productCode?: string              // Código do produto (CLAREZA, OGI)
  level?: number                    // Qual nível (1, 2, 3)
  
  // Active Campaign
  acContactId?: string
  acCampaignId?: string
  
  // Status do email
  sentAt?: Date
  deliveredAt?: Date
  openedAt?: Date
  clickedAt?: Date
  bouncedAt?: Date
  unsubscribedAt?: Date
  
  status: CommunicationStatus
  
  // ===== NOVOS CAMPOS: RESULTADO =====
  studentReturnedAt?: Date          // Quando aluno voltou
  timeToReturn?: number             // Minutos entre email e retorno
  outcome?: 'SUCCESS' | 'NO_RESPONSE' | 'ESCALATED' | 'BOUNCED' | 'UNSUBSCRIBED'
  // SUCCESS: Aluno voltou
  // NO_RESPONSE: Não abriu ou não voltou
  // ESCALATED: Escalou para próximo nível
  // BOUNCED: Email teve bounce
  // UNSUBSCRIBED: Fez unsubscribe
  
  // ===== NOVOS CAMPOS: CONTEXTO =====
  daysInactiveWhenSent?: number     // Dias inativo quando email foi enviado
  previousLevel?: number            // Nível anterior (se escalou)
  
  // Contexto (mantido para compatibilidade)
  userStateSnapshot?: IUserStateSnapshot
  
  // ===== NOVOS CAMPOS: METADADOS =====
  sentBy?: 'CRON_AUTO' | 'MANUAL' | 'API'  // Tipo de envio
  
  source: CommunicationSource
  appliedBy?: string
  notes?: string                    // Notas internas
  
  createdAt: Date
  updatedAt: Date
  
  // ===== MÉTODOS =====
  markAsOpened(): void
  markAsClicked(): void
  markAsReturned(): void
  hasEngagement(): boolean
}

// ─────────────────────────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────────────────────────

const UserStateSnapshotSchema = new Schema<IUserStateSnapshot>({
  daysSinceLastAction: { type: Number },     // ✅ Opcional (Clareza)
  daysSinceLastLogin: { type: Number },      // ✅ ADICIONAR (OGI)
  currentProgress: { type: Number, required: true },
  currentPhase: { type: String, required: true }
}, { _id: false })

const CommunicationHistorySchema = new Schema<ICommunicationHistory>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  courseId: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
    index: true
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    index: true,
    sparse: true  // 🆕 V2: Opcional durante migração
  },
  
  tagRuleId: {
    type: Schema.Types.ObjectId,
    ref: 'TagRule'
  },
  tagApplied: {
    type: String,
    required: true,
    index: true
  },
  
  // ===== NOVOS CAMPOS: RE-ENGAGEMENT =====
  productCode: {
    type: String,
    uppercase: true,
    trim: true,
    index: true
  },
  level: {
    type: Number,
    min: 1,
    index: true
  },
  
  // Active Campaign IDs
  acContactId: { type: String },
  acCampaignId: { type: String },
  
  // Status timestamps
  sentAt: { 
    type: Date,
    index: true 
  },
  deliveredAt: { type: Date },
  openedAt: { 
    type: Date,
    index: true 
  },
  clickedAt: { type: Date },
  bouncedAt: { type: Date },
  unsubscribedAt: { type: Date },
  
  status: {
    type: String,
    enum: ['PENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'UNSUBSCRIBED'],
    required: true,
    default: 'PENDING',
    index: true
  },
  
  // ===== NOVOS CAMPOS: RESULTADO =====
  studentReturnedAt: {
    type: Date,
    index: true
  },
  timeToReturn: {
    type: Number,
    min: 0
  },
  outcome: {
    type: String,
    enum: ['SUCCESS', 'NO_RESPONSE', 'ESCALATED', 'BOUNCED', 'UNSUBSCRIBED'],
    default: 'NO_RESPONSE'
  },
  
  // ===== NOVOS CAMPOS: CONTEXTO =====
  daysInactiveWhenSent: {
    type: Number,
    min: 0
  },
  previousLevel: {
    type: Number,
    min: 1
  },
  
  userStateSnapshot: {
    type: UserStateSnapshotSchema
  },
  
  // ===== NOVOS CAMPOS: METADADOS =====
  sentBy: {
    type: String,
    enum: ['CRON_AUTO', 'MANUAL', 'API'],
    default: 'CRON_AUTO'
  },
  
  source: {
    type: String,
    enum: ['AUTOMATIC', 'MANUAL'],
    required: true,
    default: 'AUTOMATIC'
  },
  appliedBy: { type: String },
  notes: { type: String }
}, {
  timestamps: true,
  collection: 'communicationhistories'
})

// ─────────────────────────────────────────────────────────────
// ÍNDICES COMPOSTOS
// ─────────────────────────────────────────────────────────────

CommunicationHistorySchema.index({ userId: 1, createdAt: -1 })
CommunicationHistorySchema.index({ userId: 1, courseId: 1, createdAt: -1 })
CommunicationHistorySchema.index({ tagApplied: 1, status: 1 })
CommunicationHistorySchema.index({ courseId: 1, status: 1, createdAt: -1 })

// ===== NOVOS ÍNDICES: RE-ENGAGEMENT =====
CommunicationHistorySchema.index({ userId: 1, productCode: 1, sentAt: -1 })
CommunicationHistorySchema.index({ productCode: 1, outcome: 1 })
CommunicationHistorySchema.index({ productCode: 1, level: 1, sentAt: -1 })

// 🆕 ÍNDICES V2: Para Product
CommunicationHistorySchema.index({ userId: 1, productId: 1, createdAt: -1 })
CommunicationHistorySchema.index({ productId: 1, status: 1, createdAt: -1 })

// ─────────────────────────────────────────────────────────────
// MÉTODOS DO DOCUMENTO
// ─────────────────────────────────────────────────────────────

CommunicationHistorySchema.methods = {
  /**
   * Marcar email como aberto
   */
  markAsOpened() {
    if (!this.openedAt) {
      this.openedAt = new Date()
      this.status = 'OPENED'
    }
  },
  
  /**
   * Marcar email como clicado
   */
  markAsClicked() {
    if (!this.clickedAt) {
      this.clickedAt = new Date()
      this.status = 'CLICKED'
    }
    // Se clicou, certamente abriu
    if (!this.openedAt) {
      this.openedAt = new Date()
    }
  },
  
  /**
   * Marcar aluno como retornado
   */
  markAsReturned() {
    this.studentReturnedAt = new Date()
    this.outcome = 'SUCCESS'
    
    // Calcular tempo até retorno
    if (this.sentAt) {
      const sentTime = this.sentAt.getTime()
      const returnTime = this.studentReturnedAt.getTime()
      this.timeToReturn = Math.floor((returnTime - sentTime) / (1000 * 60))  // Minutos
    }
  },
  
  /**
   * Verificar se aluno respondeu (abriu ou clicou)
   */
  hasEngagement(): boolean {
    return !!(this.openedAt || this.clickedAt)
  }
}

// ─────────────────────────────────────────────────────────────
// MÉTODOS ESTÁTICOS
// ─────────────────────────────────────────────────────────────

CommunicationHistorySchema.statics.getLastCommunication = async function(
  userId: mongoose.Types.ObjectId,
  courseId: mongoose.Types.ObjectId
) {
  return this.findOne({ userId, courseId }).sort({ createdAt: -1 })
}

CommunicationHistorySchema.statics.getEngagementStats = async function(
  userId: mongoose.Types.ObjectId,
  courseId: mongoose.Types.ObjectId
) {
  const stats = await this.aggregate([
    { $match: { userId, courseId } },
    {
      $group: {
        _id: null,
        totalSent: { $sum: 1 },
        totalOpened: {
          $sum: { $cond: [{ $ne: ['$openedAt', null] }, 1, 0] }
        },
        totalClicked: {
          $sum: { $cond: [{ $ne: ['$clickedAt', null] }, 1, 0] }
        }
      }
    }
  ])
  
  if (stats.length === 0) {
    return { totalSent: 0, totalOpened: 0, totalClicked: 0, engagementRate: 0 }
  }
  
  const { totalSent, totalOpened, totalClicked } = stats[0]
  const engagementRate = totalSent > 0 
    ? ((totalOpened + totalClicked) / totalSent) * 100 
    : 0
  
  return { totalSent, totalOpened, totalClicked, engagementRate }
}

// ===== NOVOS MÉTODOS ESTÁTICOS: RE-ENGAGEMENT =====

/**
 * Obter última comunicação de um aluno em um produto
 */
CommunicationHistorySchema.statics.getLastForUser = async function(
  userId: string, 
  productCode: string
) {
  return this.findOne({ userId, productCode })
    .sort({ sentAt: -1 })
}

/**
 * Calcular métricas por nível
 */
CommunicationHistorySchema.statics.getMetricsByLevel = async function(
  productCode: string, 
  level: number
) {
  const communications = await this.find({ productCode, level })
  
  const totalSent = communications.length
  const opened = communications.filter((c: any) => c.openedAt).length
  const clicked = communications.filter((c: any) => c.clickedAt).length
  const returned = communications.filter((c: any) => c.outcome === 'SUCCESS').length
  
  return {
    totalSent,
    opened,
    clicked,
    returned,
    openRate: totalSent > 0 ? (opened / totalSent) * 100 : 0,
    clickRate: totalSent > 0 ? (clicked / totalSent) * 100 : 0,
    returnRate: totalSent > 0 ? (returned / totalSent) * 100 : 0
  }
}

/**
 * Obter tempo médio de retorno
 */
CommunicationHistorySchema.statics.getAverageTimeToReturn = async function(
  productCode: string, 
  level?: number
) {
  const query: any = {
    productCode,
    outcome: 'SUCCESS',
    timeToReturn: { $exists: true }
  }
  
  if (level) {
    query.level = level
  }
  
  const communications = await this.find(query)
  
  if (communications.length === 0) return 0
  
  const totalMinutes = communications.reduce((sum: number, c: any) => sum + (c.timeToReturn || 0), 0)
  return Math.floor(totalMinutes / communications.length)
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

const CommunicationHistory = mongoose.models.CommunicationHistory || 
  mongoose.model<ICommunicationHistory>('CommunicationHistory', CommunicationHistorySchema)

export default CommunicationHistory

