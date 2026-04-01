// ════════════════════════════════════════════════════════════
// 📁 src/models/UserProduct.ts
// NOVO MODELO: Tabela JOIN entre User e Product
// 🆕 ATUALIZADO: daysSinceEnrollment e enrolledAt no engagement
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export type EnrollmentStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'PARA_INATIVAR' | 'QUARENTENA'
export type EnrollmentSource = 'PURCHASE' | 'MANUAL' | 'MIGRATION' | 'TRIAL'
export type PlatformType = 'hotmart' | 'curseduca' | 'discord'

export interface IProgress {
  percentage: number
  currentModule?: number
  modulesCompleted?: string[]  // Array de nomes de módulos (Hotmart)
  lessonsCompleted?: string[]  // Array de pageIds (Hotmart)
  lastActivity?: Date
  // ✅ HOTMART: Contadores de lições
  completed?: number  // Número de lições completadas
  total?: number      // Total de lições disponíveis

  // ✅ HOTMART: Detalhes completos dos módulos
  modulesList?: Array<{
    moduleId: string
    name: string
    sequence: number
    totalPages: number
    completedPages: number
    isCompleted: boolean
    isExtra: boolean
    progressPercentage: number
    lastCompletedDate?: number
  }>
  totalModules?: number  // Total de módulos do curso

  // 🔴 REMOVIDOS - Não disponíveis nos APIs:
  // reportsGenerated, lastReportOpen (Curseduca não fornece)
  // videosWatched, quizzesCompleted (Hotmart não fornece)
}

export interface IEngagement {
  engagementScore: number

  // LOGIN_BASED (OGI/Hotmart)
  lastLogin?: Date
  daysSinceLastLogin?: number  // Calculado no Sprint 1.5B
  totalLogins?: number  // = accessCount (Hotmart)

  // ACTION_BASED (Clareza/Curseduca)
  lastAction?: Date
  daysSinceLastAction?: number  // Calculado no Sprint 1.5B

  // 🆕 ENROLLMENT TRACKING (ambas plataformas)
  daysSinceEnrollment?: number  // Calculado
  enrolledAt?: Date

  // 🆕 TAG SYSTEM V2 - Campos necessários para novo sistema de tags
  daysInactive?: number  // Dias desde último acesso (usa daysSinceLastLogin ou daysSinceLastAction)
  loginsLast30Days?: number  // Logins nos últimos 30 dias (para consistência)
  weeksActiveLast30Days?: number  // Semanas com pelo menos 1 acesso nos últimos 30 dias

  // 🔴 REMOVIDOS - Não disponíveis nos APIs:
  // loginStreak (precisa cálculo complexo)
  // totalActions, actionsLastWeek, actionsLastMonth (Curseduca não fornece)
  // consistency (precisa cálculo complexo)
}

export interface IClassEnrollment {
  classId: string
  className?: string  // ⚠️ DEPRECATED - Não guardado no sync! Use lookup na tabela Class
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
  isPrimary: boolean
  isAdmin?: boolean  // 🔑 Admin flag - bypassa validações de inativação

  metadata?: {
    purchaseValue?: number
    purchaseDate?: Date
    refunded?: boolean
    refundedAt?: Date
    notes?: string
    platform?: string
  }

  platformData?: Record<string, unknown>

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
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CANCELLED', 'PARA_INATIVAR'],
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
    currentModule: Number,  // Hotmart apenas
    modulesCompleted: [String],  // Array de nomes de módulos (Hotmart)
    lessonsCompleted: [String],  // Array de pageIds (Hotmart)
    lastActivity: Date,
    completed: Number,  // Número de lições completadas (Hotmart)
    total: Number,      // Total de lições (Hotmart)

    // ✅ HOTMART: Detalhes completos dos módulos
    modulesList: [{
      moduleId: String,
      name: String,
      sequence: Number,
      totalPages: Number,
      completedPages: Number,
      isCompleted: Boolean,
      isExtra: Boolean,
      progressPercentage: Number,
      lastCompletedDate: Number
    }],
    totalModules: Number  // Total de módulos do curso

    // 🔴 REMOVIDOS campos não disponíveis nos APIs
  },
  
  // ═══════════════════════════════════════════════════════════
  // ENGAGEMENT (SEGREGADO POR PRODUTO!)
  // ═══════════════════════════════════════════════════════════
  
  engagement: {
    engagementScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 1000
    },

    // LOGIN_BASED (OGI/Hotmart)
    lastLogin: Date,
    daysSinceLastLogin: Number,  // Calculado
    totalLogins: Number,  // = accessCount (Hotmart)

    // ACTION_BASED (Clareza/Curseduca)
    lastAction: Date,
    daysSinceLastAction: Number,  // Calculado

    // ENROLLMENT TRACKING
    daysSinceEnrollment: Number,  // Calculado
    enrolledAt: Date

    // 🔴 REMOVIDOS campos não disponíveis:
    // loginStreak, totalActions, actionsLastWeek, actionsLastMonth, consistency
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
  // isPrimary
  // ═══════════════════════════════════════════════════════════

  isPrimary: {
    type: Boolean,
    default: true,
    index: true
  },

  // ═══════════════════════════════════════════════════════════
  // isAdmin - Flag para bypass de validações
  // ═══════════════════════════════════════════════════════════

  isAdmin: {
    type: Boolean,
    default: false,
    index: true
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
    notes: String,
    platform: String
  },

  platformData: Schema.Types.Mixed
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
  return this.classes.find((c: IClassEnrollment) => !c.leftAt)
}

UserProductSchema.methods.hasLeftAllClasses = function(): boolean {
  return this.classes.every((c: IClassEnrollment) => c.leftAt)
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
