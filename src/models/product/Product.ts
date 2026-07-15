// ════════════════════════════════════════════════════════════
// 📁 src/models/Product.ts
// NOVO MODELO: Produto (OGI-V1, OGI-V2, Clareza, etc)
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export type PlatformType = 'hotmart' | 'curseduca' | 'discord' | 'mixed'

export interface IActiveCampaignProductConfig {
  tagPrefix: string           
  listId: string
  automationIds?: string[]
}

export interface IProductSettings {
  allowMultipleEnrollments: boolean
  requiresApproval: boolean
  maxStudents?: number
}

export interface IProduct extends Document {
  _id: mongoose.Types.ObjectId
  code: string
  name: string
  description?: string
  
  courseId: mongoose.Types.ObjectId
  platform: PlatformType
  courseCode?: string
  hotmartProductId?: string
   subdomain?: string      
  curseducaGroupId?: string
  curseducaGroupUuid?: string
  discordRoleId?: string

  // 💰 GURU
  guruProductId?: string
  guruOfferId?: string

  activeCampaignConfig?: IActiveCampaignProductConfig
  
  isActive: boolean
  launchDate?: Date
  sunsetDate?: Date
  
  settings?: IProductSettings
  
  createdAt: Date
  updatedAt: Date
  
  // Métodos
  getPlatformId(): string | undefined
  isAvailable(): boolean
}

// ─────────────────────────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────────────────────────

const ProductSchema = new Schema<IProduct>({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
    uppercase: true
    // Ex: "OGI-V1", "OGI-V2", "CLAREZA-BASIC", "CLAREZA-PREMIUM"
  },
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
    // Ex: "O Grande Investimento V1", "Clareza Básico"
  },
  courseCode: {
    type: String,
    trim: true,
    uppercase: true,
    index: true
    // Ex: "OGI", "CLAREZA", "OUTRO"
    // Mapeia para Course.code (permite múltiplos products por course)
  },
  description: {
    type: String,
    trim: true
  },
  
  // ═══════════════════════════════════════════════════════════
  // RELACIONAMENTOS
  // ═══════════════════════════════════════════════════════════
  
  courseId: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  
  platform: {
    type: String,
    enum: ['hotmart', 'curseduca', 'discord', 'mixed'],
    required: true,
    index: true
  },
  
  // ═══════════════════════════════════════════════════════════
  // IDS ESPECÍFICOS DE PLATAFORMA
  // ═══════════════════════════════════════════════════════════
  
  hotmartProductId: {
    type: String,
    sparse: true,
    index: true
    // ID do produto no Hotmart (ex: "123456")
  },
   subdomain: {                     // ✅ ADICIONAR
   type: String,
   sparse: true,
   index: true,
   description: 'Hotmart subdomain for API calls'
 },
  curseducaGroupId: {
    type: String,
    sparse: true,
    index: true
    // ID numérico do grupo no Curseduca
  },
  
  curseducaGroupUuid: {
    type: String,
    sparse: true,
    index: true
    // UUID do grupo no Curseduca
  },
  
  discordRoleId: {
    type: String,
    sparse: true,
    index: true
    // ID do role no Discord
  },

  // ═══════════════════════════════════════════════════════════
  // 💰 GURU
  // ═══════════════════════════════════════════════════════════

  guruProductId: {
    type: String,
    sparse: true,
    index: true
    // ID do produto na Guru (ex: "9fa25a47-34d8-41ef-b684-0285e1c33aa4")
  },

  guruOfferId: {
    type: String,
    sparse: true,
    index: true
    // ID da oferta na Guru (ex: "a0e39582-1c07-4548-816a-e85aa693e1f2")
  },

  // ═══════════════════════════════════════════════════════════
  // ACTIVE CAMPAIGN
  // ═══════════════════════════════════════════════════════════
  
  activeCampaignConfig: {
    tagPrefix: {
      type: String,
      trim: true
      // Ex: "OGI-V1", "CLAREZA" (usado para gerar tags específicas)
    },
    listId: {
      type: String,
      trim: true
    },
    automationIds: [{
      type: String,
      trim: true
    }]
  },
  
  // ═══════════════════════════════════════════════════════════
  // GESTÃO DO PRODUTO
  // ═══════════════════════════════════════════════════════════
  
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  launchDate: {
    type: Date,
    index: true
  },
  
  sunsetDate: {
    type: Date,
    index: true
    // Para produtos descontinuados
  },
  
  settings: {
    allowMultipleEnrollments: {
      type: Boolean,
      default: false
      // User pode estar em OGI-V1 e OGI-V2 ao mesmo tempo?
    },
    requiresApproval: {
      type: Boolean,
      default: false
    },
    maxStudents: {
      type: Number
    }
  }
}, {
  timestamps: true,
  collection: 'products'
})

// ─────────────────────────────────────────────────────────────
// ÍNDICES COMPOSTOS
// ─────────────────────────────────────────────────────────────

ProductSchema.index({ courseId: 1, platform: 1 })
ProductSchema.index({ platform: 1, isActive: 1 })
ProductSchema.index({ code: 1, isActive: 1 })
ProductSchema.index({ isActive: 1, launchDate: -1 })
// 💰 Guru indexes
ProductSchema.index({ guruProductId: 1 })
ProductSchema.index({ guruOfferId: 1 })

// ─────────────────────────────────────────────────────────────
// MÉTODOS
// ─────────────────────────────────────────────────────────────

ProductSchema.methods.getPlatformId = function(): string | undefined {
  switch (this.platform) {
    case 'hotmart':
      return this.hotmartProductId
    case 'curseduca':
      return this.curseducaGroupUuid || this.curseducaGroupId
    case 'discord':
      return this.discordRoleId
    default:
      return undefined
  }
}

ProductSchema.methods.isAvailable = function(): boolean {
  if (!this.isActive) return false
  
  const now = new Date()
  
  if (this.launchDate && now < this.launchDate) return false
  if (this.sunsetDate && now > this.sunsetDate) return false
  
  return true
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

const Product: mongoose.Model<IProduct> = mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema)

export default Product

