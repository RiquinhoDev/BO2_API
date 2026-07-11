// ══════════════════════════════════════════════════════════════════════
// 📁 src/models/UserSnapshot.ts
// Snapshot completo do estado do utilizador ANTES de cada sync
// Permite comparar diferenças e gerar histórico detalhado
// ══════════════════════════════════════════════════════════════════════

import mongoose, { Schema, model, type Model } from 'mongoose'

// ═══════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════

export interface IProductSnapshot {
  productId: string
  productName: string
  platform: 'hotmart' | 'curseduca' | 'discord'
  status: string
  enrolledAt: Date | null

  // Progress
  progressPercentage: number
  completedLessons?: number
  totalLessons?: number
  lastActivity?: Date | null

  // Engagement
  engagementScore?: number
  totalLogins?: number
  lastLogin?: Date | null

  // Classes
  classes?: Array<{
    classId: string
    className: string
    role?: string
    joinedAt?: Date | null
  }>

  // Metadata
  raw?: any // Dados brutos da plataforma
}

export interface IUserSnapshot {
  // Referências
  userId: mongoose.Types.ObjectId
  userEmail: string

  // Identificação do sync
  syncId?: mongoose.Types.ObjectId
  syncType: 'hotmart' | 'curseduca' | 'discord' | 'manual'
  snapshotDate: Date

  // Estado do User (cache)
  userState: {
    name: string
    email: string
    averageEngagement?: number
    averageEngagementLevel?: string
    totalProducts?: number
    activePlatforms?: string[]
  }

  // Estado dos produtos
  products: IProductSnapshot[]

  // Estatísticas gerais
  stats: {
    totalProducts: number
    activeProducts: number
    inactiveProducts: number
    totalClasses: number
    activeClasses: number
    platformCounts: {
      hotmart: number
      curseduca: number
      discord: number
    }
  }

  // Metadata
  createdAt: Date
  expiresAt?: Date // Snapshots podem expirar após X meses
}

export type UserSnapshotModelType = Model<IUserSnapshot>

// ═══════════════════════════════════════════════════════════════
// SUB-SCHEMAS
// ═══════════════════════════════════════════════════════════════

const ClassSnapshotSchema = new Schema({
  classId: { type: String, required: true },
  className: { type: String, required: true },
  role: String,
  joinedAt: Date
}, { _id: false })

const ProductSnapshotSchema = new Schema({
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  platform: {
    type: String,
    enum: ['hotmart', 'curseduca', 'discord'],
    required: true
  },
  status: { type: String, required: true },
  enrolledAt: Date,

  // Progress
  progressPercentage: { type: Number, default: 0 },
  completedLessons: Number,
  totalLessons: Number,
  lastActivity: Date,

  // Engagement
  engagementScore: Number,
  totalLogins: Number,
  lastLogin: Date,

  // Classes
  classes: [ClassSnapshotSchema],

  // Metadata
  raw: Schema.Types.Mixed
}, { _id: false })

const UserStateSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  averageEngagement: Number,
  averageEngagementLevel: String,
  totalProducts: Number,
  activePlatforms: [String]
}, { _id: false })

const StatsSchema = new Schema({
  totalProducts: { type: Number, default: 0 },
  activeProducts: { type: Number, default: 0 },
  inactiveProducts: { type: Number, default: 0 },
  totalClasses: { type: Number, default: 0 },
  activeClasses: { type: Number, default: 0 },
  platformCounts: {
    hotmart: { type: Number, default: 0 },
    curseduca: { type: Number, default: 0 },
    discord: { type: Number, default: 0 }
  }
}, { _id: false })

// ═══════════════════════════════════════════════════════════════
// SCHEMA PRINCIPAL
// ═══════════════════════════════════════════════════════════════

const userSnapshotSchema = new Schema<IUserSnapshot>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true
    },
    userEmail: {
      type: String,
      required: true,
      index: true
    },

    syncId: {
      type: Schema.Types.ObjectId,
      ref: 'SyncHistory',
      index: true
    },
    syncType: {
      type: String,
      enum: ['hotmart', 'curseduca', 'discord', 'manual'],
      required: true,
      index: true
    },
    snapshotDate: {
      type: Date,
      default: Date.now,
      required: true,
      // TTL de 7 dias (aplicado em produção a 2026-07-11 via collMod, depois de a
      // coleção encher a quota do Atlas — 124k docs/147MB em 25 dias e bloquear as
      // escritas do cluster). O Mongo apaga sozinho snapshots com >7 dias; a
      // retenção "6 meses" do expiresAt abaixo nunca teve TTL e não cabia em 512MB.
      index: { expireAfterSeconds: 7 * 24 * 3600 }
    },

    userState: {
      type: UserStateSchema,
      required: true
    },

    products: {
      type: [ProductSnapshotSchema],
      default: []
    },

    stats: {
      type: StatsSchema,
      required: true
    },

    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    expiresAt: {
      type: Date,
      index: true
    }
  },
  {
    timestamps: false,
    collection: 'usersnapshots'
  }
)

// ═══════════════════════════════════════════════════════════════
// ÍNDICES
// ═══════════════════════════════════════════════════════════════

// Índice composto para buscar snapshots de um user por tipo de sync
userSnapshotSchema.index({ userId: 1, syncType: 1, snapshotDate: -1 })

// Índice para buscar snapshots por email
userSnapshotSchema.index({ userEmail: 1, snapshotDate: -1 })

// Índice para cleanup de snapshots expirados
userSnapshotSchema.index({ expiresAt: 1 })

// Índice para buscar por syncId
userSnapshotSchema.index({ syncId: 1, snapshotDate: -1 })

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

// Antes de salvar, definir expiresAt automaticamente (6 meses)
userSnapshotSchema.pre('save', function(next) {
  if (!this.expiresAt) {
    const expirationDate = new Date(this.snapshotDate)
    expirationDate.setMonth(expirationDate.getMonth() + 6)
    this.expiresAt = expirationDate
  }
  next()
})

// ═══════════════════════════════════════════════════════════════
// MODEL
// ═══════════════════════════════════════════════════════════════

const UserSnapshot: UserSnapshotModelType =
  (mongoose.models.UserSnapshot as UserSnapshotModelType) ??
  model<IUserSnapshot>('UserSnapshot', userSnapshotSchema)

export default UserSnapshot

export function ensureUserSnapshotModel(): UserSnapshotModelType {
  return (mongoose.models.UserSnapshot as UserSnapshotModelType) ?? UserSnapshot
}
