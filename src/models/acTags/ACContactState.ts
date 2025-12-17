// ════════════════════════════════════════════════════════════
// 📁 src/models/ACContactState.ts
// Model para cache de estado de contactos AC
// ════════════════════════════════════════════════════════════

import { Schema, model, Document } from 'mongoose'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export interface IACContactTag {
  id: string
  name: string
  appliedAt: Date
  source: 'bo_system' | 'ac_manual' | 'ac_automation' | 'unknown'
  isSystemTag: boolean
}

export interface IACDetectedProduct {
  code: string
  name: string
  detectedFromTags: string[]
  currentLevel: number | null
  confidence: number
  isActive: boolean
  suggestedAction: string
}

export interface IACContactState extends Document {
  email: string
  contactId: string
  lastSyncAt: Date
  tags: IACContactTag[]
  detectedProducts: IACDetectedProduct[]
  boUserId?: string
  inconsistenciesCount: number
  lastInconsistencyCheck: Date
  metadata: {
    totalTags: number
    systemTags: number
    manualTags: number
    automationTags: number
    highConfidenceProducts: number
  }
  createdAt: Date
  updatedAt: Date
  updateMetadata(): void
  getSystemTags(): IACContactTag[]
  getActiveProducts(): IACDetectedProduct[]
  hasProduct(productCode: string): boolean
}

// ─────────────────────────────────────────────────────────────
// SCHEMAS
// ─────────────────────────────────────────────────────────────

const ACContactTagSchema = new Schema({
  id: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true,
    index: true
  },
  appliedAt: {
    type: Date,
    required: true
  },
  source: {
    type: String,
    enum: ['bo_system', 'ac_manual', 'ac_automation', 'unknown'],
    default: 'unknown'
  },
  isSystemTag: {
    type: Boolean,
    default: false,
    index: true
  }
}, { _id: false })

const ACDetectedProductSchema = new Schema({
  code: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  detectedFromTags: [{
    type: String
  }],
  currentLevel: {
    type: Number,
    default: null
  },
  confidence: {
    type: Number,
    min: 0,
    max: 100,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  suggestedAction: {
    type: String,
    default: ''
  }
}, { _id: false })

const ACContactStateSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true
  },
  contactId: {
    type: String,
    required: true,
    index: true
  },
  lastSyncAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  tags: [ACContactTagSchema],
  detectedProducts: [ACDetectedProductSchema],
  boUserId: {
    type: String,
    default: null,
    index: true
  },
  inconsistenciesCount: {
    type: Number,
    default: 0,
    index: true
  },
  lastInconsistencyCheck: {
    type: Date,
    default: Date.now
  },
  metadata: {
    totalTags: {
      type: Number,
      default: 0
    },
    systemTags: {
      type: Number,
      default: 0
    },
    manualTags: {
      type: Number,
      default: 0
    },
    automationTags: {
      type: Number,
      default: 0
    },
    highConfidenceProducts: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  collection: 'ac_contact_states'
})

// ─────────────────────────────────────────────────────────────
// ÍNDICES
// ─────────────────────────────────────────────────────────────

// Índice composto para queries comuns
ACContactStateSchema.index({ lastSyncAt: 1, inconsistenciesCount: 1 })
ACContactStateSchema.index({ 'detectedProducts.code': 1, 'detectedProducts.isActive': 1 })
ACContactStateSchema.index({ 'tags.name': 1, 'tags.source': 1 })

// Índice TTL - remover dados antigos após 90 dias
ACContactStateSchema.index({ lastSyncAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })

// ─────────────────────────────────────────────────────────────
// MÉTODOS DE INSTÂNCIA
// ─────────────────────────────────────────────────────────────

ACContactStateSchema.methods.updateMetadata = function() {
  this.metadata.totalTags = this.tags.length
  this.metadata.systemTags = this.tags.filter((t: IACContactTag) => t.isSystemTag).length
  this.metadata.manualTags = this.tags.filter((t: IACContactTag) => t.source === 'ac_manual').length
  this.metadata.automationTags = this.tags.filter((t: IACContactTag) => t.source === 'ac_automation').length
  this.metadata.highConfidenceProducts = this.detectedProducts.filter((p: IACDetectedProduct) => p.confidence >= 80).length
}

ACContactStateSchema.methods.getSystemTags = function(): IACContactTag[] {
  return this.tags.filter((t: IACContactTag) => t.isSystemTag)
}

ACContactStateSchema.methods.getActiveProducts = function(): IACDetectedProduct[] {
  return this.detectedProducts.filter((p: IACDetectedProduct) => p.isActive && p.confidence >= 70)
}

ACContactStateSchema.methods.hasProduct = function(productCode: string): boolean {
  return this.detectedProducts.some((p: IACDetectedProduct) => 
    p.code === productCode && p.confidence >= 70
  )
}

// ─────────────────────────────────────────────────────────────
// MÉTODOS DE INSTÂNCIA
// ─────────────────────────────────────────────────────────────

ACContactStateSchema.methods.updateMetadata = function(this: IACContactState) {
  this.metadata.totalTags = this.tags.length
  this.metadata.systemTags = this.tags.filter((t) => t.isSystemTag).length
  this.metadata.manualTags = this.tags.filter((t) => t.source === 'ac_manual').length
  this.metadata.automationTags = this.tags.filter((t) => t.source === 'ac_automation').length
  this.metadata.highConfidenceProducts = this.detectedProducts.filter((p) => p.confidence >= 80).length
}

ACContactStateSchema.methods.getSystemTags = function(this: IACContactState): IACContactTag[] {
  return this.tags.filter((t) => t.isSystemTag)
}

ACContactStateSchema.methods.getActiveProducts = function(this: IACContactState): IACDetectedProduct[] {
  return this.detectedProducts.filter((p) => p.isActive && p.confidence >= 70)
}

ACContactStateSchema.methods.hasProduct = function(this: IACContactState, productCode: string): boolean {
  return this.detectedProducts.some((p) => p.code === productCode && p.confidence >= 70)
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────

ACContactStateSchema.pre('save', function(this: IACContactState, next) {
  if (this.isModified('tags') || this.isModified('detectedProducts')) {
    this.updateMetadata()
  }
  next()
})
// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

export default model<IACContactState>('ACContactState', ACContactStateSchema)

