// ════════════════════════════════════════════════════════════
// 📁 src/models/UserProduct.ts
// NOVO MODELO: Tabela JOIN entre User e Product
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export type EnrollmentStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'CANCELLED'
export type EnrollmentSource = 'PURCHASE' | 'MANUAL' | 'MIGRATION' | 'TRIAL'
export type PlatformType = 'hotmart' | 'curseduca' | 'discord'

export interface IProgress {
  percentage: number
  currentModule?: number
  modulesCompleted?: number[]
  lessonsCompleted?: number[]
  lastActivity?: Date
  
  // Clareza specific
  reportsGenerated?: number
  lastReportOpen?: Date
  
  // OGI specific
  videosWatched?: number
  quizzesCompleted?: number
}

export interface IEngagement {
  engagementScore: number
  
  // LOGIN_BASED (OGI)
  lastLogin?: Date
  daysSinceLastLogin?: number
  totalLogins?: number
  loginStreak?: number
  
  // ACTION_BASED (Clareza)
  lastAction?: Date
  daysSinceLastAction?: number
  totalActions?: number
  actionsLastWeek?: number
  actionsLastMonth?: number
  
  // Comum
  consistency?: number
}

export interface IClassEnrollment {
  classId: string
  className?: string
  joinedAt: Date
  leftAt?: Date
}

export interface IActiveCampaignData {
  contactId?: string
  tags: string[]
  lists: string[]
  lastSyncAt?: Date
}

export interface ICommunications {
  emailsSent: number
  emailsOpened: number
  lastEmailSent?: Date
  lastEmailOpened?: Date
  unsubscribed: boolean
  unsubscribedAt?: Date
}

export interface IUserProduct extends Document {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  productId: mongoose.Types.ObjectId
  
  platform: PlatformType
  platformUserId: string
  platformUserUuid?: string
  
  enrolledAt: Date
  status: EnrollmentStatus
  source: EnrollmentSource
  
  progress?: IProgress
  engagement?: IEngagement
  
  classes: IClassEnrollment[]
  
  activeCampaignData?: IActiveCampaignData
  communications?: ICommunications
  
  metadata?: {
    purchaseValue?: number
    purchaseDate?: Date
    refunded?: boolean
    refundedAt?: Date
    notes?: string
  }
  
  createdAt: Date
  updatedAt: Date
  
  // Métodos
  isActive(): boolean
  getCurrentClass(): IClassEnrollment | undefined
  hasLeftAllClasses(): boolean
  getDaysSinceEnrollment(): number
}

// ─────────────────────────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────────────────────────

const UserProductSchema = new Schema<IUserProduct>({
  // ═══════════════════════════════════════════════════════════
  // RELACIONAMENTOS
  // ═══════════════════════════════════════════════════════════
  
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  
  // ═══════════════════════════════════════════════════════════
  // PLATAFORMA
  // ═══════════════════════════════════════════════════════════
  
  platform: {
    type: String,
    enum: ['hotmart', 'curseduca', 'discord'],
    required: true,
    index: true
  },
  
  platformUserId: {
    type: String,
    required: true,
    index: true
    // Ex: hotmartUserId, curseducaUserId, discordId
  },
  
  platformUserUuid: {
    type: String,
    sparse: true,
    index: true
    // Para Curseduca que usa UUID
  },
  
  // ═══════════════════════════════════════════════════════════
  // ENROLLMENT
  // ═══════════════════════════════════════════════════════════
  
  enrolledAt: {
    type: Date,
    required: true,
    index: true
  },
  
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CANCELLED'],
    default: 'ACTIVE',
    required: true,
    index: true
  },
  
  source: {
    type: String,
    enum: ['PURCHASE', 'MANUAL', 'MIGRATION', 'TRIAL'],
    default: 'PURCHASE',
    required: true,
    index: true
  },
  
  // ═══════════════════════════════════════════════════════════
  // PROGRESS (SEGREGADO POR PRODUTO!)
  // ═══════════════════════════════════════════════════════════
  
  progress: {
    percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    currentModule: Number,
    modulesCompleted: [Number],
    lessonsCompleted: [Number],
    lastActivity: Date,
    
    // Clareza specific
    reportsGenerated: Number,
    lastReportOpen: Date,
    
    // OGI specific
    videosWatched: Number,
    quizzesCompleted: Number
  },
  
  // ═══════════════════════════════════════════════════════════
  // ENGAGEMENT (SEGREGADO POR PRODUTO!)
  // ═══════════════════════════════════════════════════════════
  
  engagement: {
    engagementScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    
    // LOGIN_BASED (OGI)
    lastLogin: Date,
    daysSinceLastLogin: Number,
    totalLogins: Number,
    loginStreak: Number,
    
    // ACTION_BASED (Clareza)
    lastAction: Date,
    daysSinceLastAction: Number,
    totalActions: Number,
    actionsLastWeek: Number,
    actionsLastMonth: Number,
    
    // Comum
    consistency: Number
  },
  
  // ═══════════════════════════════════════════════════════════
  // CLASSES (MÚLTIPLAS TURMAS DO MESMO PRODUTO)
  // ═══════════════════════════════════════════════════════════
  
  classes: [{
    classId: {
      type: String,
      required: true
    },
    className: String,
    joinedAt: {
      type: Date,
      required: true
    },
    leftAt: Date
  }],
  
  // ═══════════════════════════════════════════════════════════
  // ACTIVE CAMPAIGN
  // ═══════════════════════════════════════════════════════════
  
  activeCampaignData: {
    contactId: String,
    tags: [String],
    lists: [String],
    lastSyncAt: Date
  },
  
  // ═══════════════════════════════════════════════════════════
  // COMMUNICATIONS
  // ═══════════════════════════════════════════════════════════
  
  communications: {
    emailsSent: {
      type: Number,
      default: 0
    },
    emailsOpened: {
      type: Number,
      default: 0
    },
    lastEmailSent: Date,
    lastEmailOpened: Date,
    unsubscribed: {
      type: Boolean,
      default: false
    },
    unsubscribedAt: Date
  },
  
  // ═══════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════
  
  metadata: {
    purchaseValue: Number,
    purchaseDate: Date,
    refunded: {
      type: Boolean,
      default: false
    },
    refundedAt: Date,
    notes: String
  }
}, {
  timestamps: true,
  collection: 'userproducts'
})

// ─────────────────────────────────────────────────────────────
// ÍNDICES COMPOSTOS (CRÍTICOS PARA PERFORMANCE!)
// ─────────────────────────────────────────────────────────────

// Buscar todos os produtos de um user
UserProductSchema.index({ userId: 1, status: 1 })

// Buscar todos os users de um produto
UserProductSchema.index({ productId: 1, status: 1 })

// Buscar enrollment específico
UserProductSchema.index({ userId: 1, productId: 1 })

// Buscar por plataforma
UserProductSchema.index({ platform: 1, platformUserId: 1 })

// Buscar por engagement
UserProductSchema.index({ 'engagement.engagementScore': -1 })

// Buscar por progress
UserProductSchema.index({ 'progress.percentage': -1 })

// Buscar por última atividade
UserProductSchema.index({ 'progress.lastActivity': -1 })

// Active Campaign
UserProductSchema.index({ 'activeCampaignData.contactId': 1 })

// ⚡ ÍNDICE ÚNICO: User não pode ter 2 enrollments no mesmo produto
UserProductSchema.index({ userId: 1, productId: 1 }, { unique: true })

// ─────────────────────────────────────────────────────────────
// MÉTODOS
// ─────────────────────────────────────────────────────────────

UserProductSchema.methods.isActive = function(): boolean {
  return this.status === 'ACTIVE'
}

UserProductSchema.methods.getCurrentClass = function(): IClassEnrollment | undefined {
  return this.classes.find(c => !c.leftAt)
}

UserProductSchema.methods.hasLeftAllClasses = function(): boolean {
  return this.classes.every(c => c.leftAt)
}

UserProductSchema.methods.getDaysSinceEnrollment = function(): number {
  const now = new Date()
  const enrolled = new Date(this.enrolledAt)
  const diffTime = Math.abs(now.getTime() - enrolled.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

const UserProduct = mongoose.models.UserProduct || mongoose.model<IUserProduct>('UserProduct', UserProductSchema)

export default UserProduct

