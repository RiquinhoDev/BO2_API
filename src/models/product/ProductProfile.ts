// =====================================================
// 📁 src/models/ProductProfile.ts
// MODEL: Configuração de produtos e níveis de re-engagement
// =====================================================

import mongoose, { Document, Schema } from 'mongoose'

/**
 * Interface: Nível de Re-engagement
 * 
 * Cada nível representa uma "fase" na escalada de comunicação.
 * Ex: Nível 1 = Lembrete Gentil (10 dias)
 *     Nível 2 = Motivação (20 dias)
 *     Nível 3 = Urgência (30 dias)
 */
export interface IReengagementLevel {
  level: number                 // 1, 2, 3, 4...
  name: string                  // "Lembrete Gentil", "Motivação", "Urgência"
  daysInactive: number          // Quantos dias sem atividade para aplicar
  tagAC: string                 // Tag a aplicar no Active Campaign
  cooldownDays: number          // Quantos dias esperar antes de próximo nível
  emailTemplateId?: string      // ID do template de email no AC (opcional)
  description?: string          // Descrição interna do nível
}

/**
 * Interface: Product Profile
 * 
 * Cada produto (Clareza, OGI, etc) tem seu perfil com:
 * - Níveis de escalada
 * - Definição do que conta como "progresso"
 * - Configurações específicas
 */
export interface IProductProfile extends Document {
  // ===== IDENTIFICAÇÃO =====
  name: string                  // "Clareza", "O Grande Investimento"
  code: string                  // "CLAREZA", "OGI" (código único)
  description?: string          // Descrição do produto
  
  // ===== STATUS =====
  isActive: boolean             // Se sistema de re-engagement está ativo
  
  // ===== DURAÇÃO =====
  durationDays: number          // Duração total do curso (90, 180, etc)
  hasDeadline: boolean          // Se tem prazo fixo ou é perpétuo
  
  // ===== NÍVEIS DE RE-ENGAGEMENT =====
  reengagementLevels: IReengagementLevel[]  // Array de níveis (1, 2, 3...)
  
  // ===== DEFINIÇÃO DE PROGRESSO =====
  progressDefinition: {
    countsAsProgress: string[]  // Que ações contam como progresso
                                // Ex: ["LOGIN", "REPORT_OPENED", "MODULE_COMPLETED"]
    requiresMultipleActions: boolean  // Se precisa de múltiplas ações para contar
    minimumActionsPerDay?: number     // Mínimo de ações por dia (opcional)
  }
  
  // ===== CONFIGURAÇÕES AVANÇADAS =====
  settings: {
    enableAutoEscalation: boolean     // Escalar automaticamente entre níveis
    enableAutoRemoval: boolean        // Remover tags automaticamente quando aluno volta
    maxLevelBeforeStop: number        // Após qual nível parar de enviar (geralmente último nível)
    retryFailedTags: boolean          // Retentar se aplicação de tag falhar
  }
  
  // ===== TIMESTAMPS =====
  createdAt: Date
  updatedAt: Date
  createdBy?: string            // ID do admin que criou
  lastModifiedBy?: string       // ID do admin que modificou por último
  
  // ===== MÉTODOS =====
  getLevel(levelNumber: number): IReengagementLevel | undefined
  getAppropriateLevel(daysInactive: number): IReengagementLevel | null
  countsAsProgress(actionType: string): boolean
}

/**
 * Schema do Mongoose
 */
const ReengagementLevelSchema = new Schema<IReengagementLevel>({
  level: {
    type: Number,
    required: true,
    min: 1
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  daysInactive: {
    type: Number,
    required: true,
    min: 1
  },
  tagAC: {
    type: String,
    required: true,
    trim: true,
    uppercase: true  // Tags sempre em maiúsculas
  },
  cooldownDays: {
    type: Number,
    required: true,
    min: 0,
    default: 7
  },
  emailTemplateId: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  }
}, { _id: false })  // Não criar _id para subdocumentos

const ProductProfileSchema = new Schema<IProductProfile>({
  // Identificação
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true  // Índice para busca rápida por código
  },
  description: {
    type: String,
    trim: true
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true,
    index: true  // Índice para filtrar produtos ativos
  },
  
  // Duração
  durationDays: {
    type: Number,
    required: true,
    min: 1
  },
  hasDeadline: {
    type: Boolean,
    default: true
  },
  
  // Níveis
  reengagementLevels: {
    type: [ReengagementLevelSchema],
    required: true,
    validate: {
      validator: function(levels: IReengagementLevel[]) {
        // Validar que tem pelo menos 1 nível
        if (levels.length === 0) return false
        
        // Validar que níveis são sequenciais (1, 2, 3...)
        const sortedLevels = [...levels].sort((a, b) => a.level - b.level)
        for (let i = 0; i < sortedLevels.length; i++) {
          if (sortedLevels[i].level !== i + 1) return false
        }
        
        // Validar que daysInactive são crescentes
        for (let i = 1; i < sortedLevels.length; i++) {
          if (sortedLevels[i].daysInactive <= sortedLevels[i-1].daysInactive) {
            return false
          }
        }
        
        return true
      },
      message: 'Níveis devem ser sequenciais (1,2,3...) com daysInactive crescente'
    }
  },
  
  // Definição de progresso
  progressDefinition: {
    countsAsProgress: {
      type: [String],
      required: true,
      default: ['LOGIN']
    },
    requiresMultipleActions: {
      type: Boolean,
      default: false
    },
    minimumActionsPerDay: {
      type: Number,
      min: 0
    }
  },
  
  // Configurações
  settings: {
    enableAutoEscalation: {
      type: Boolean,
      default: true
    },
    enableAutoRemoval: {
      type: Boolean,
      default: true
    },
    maxLevelBeforeStop: {
      type: Number,
      min: 1,
      default: 3
    },
    retryFailedTags: {
      type: Boolean,
      default: true
    }
  },
  
  // Metadados
  createdBy: {
    type: String
  },
  lastModifiedBy: {
    type: String
  }
}, {
  timestamps: true,  // Cria createdAt e updatedAt automaticamente
  collection: 'productprofiles'
})

/**
 * Índices adicionais
 */
ProductProfileSchema.index({ code: 1, isActive: 1 })  // Busca por código + ativo

/**
 * Métodos do documento
 */
ProductProfileSchema.methods = {
  getLevel(this: IProductProfile, levelNumber: number): IReengagementLevel | undefined {
    return this.reengagementLevels.find((l) => l.level === levelNumber)
  },

  getAppropriateLevel(this: IProductProfile, daysInactive: number): IReengagementLevel | null {
    const sortedLevels = [...this.reengagementLevels].sort(
      (a, b) => a.daysInactive - b.daysInactive
    )

    let appropriateLevel: IReengagementLevel | null = null
    for (const level of sortedLevels) {
      if (daysInactive >= level.daysInactive) appropriateLevel = level
      else break
    }

    return appropriateLevel
  },

  countsAsProgress(this: IProductProfile, actionType: string): boolean {
    return this.progressDefinition.countsAsProgress.includes(actionType)
  }
}

/**
 * Métodos estáticos
 */
ProductProfileSchema.statics = {
  /**
   * Buscar produto ativo por código
   */
  async findActiveByCode(code: string) {
    return this.findOne({ code: code.toUpperCase(), isActive: true })
  },
  
  /**
   * Buscar todos os produtos ativos
   */
  async findAllActive() {
    return this.find({ isActive: true }).sort({ name: 1 })
  }
}

/**
 * Exportar model
 */
const ProductProfile: mongoose.Model<IProductProfile> = mongoose.models.ProductProfile ||
  mongoose.model<IProductProfile>('ProductProfile', ProductProfileSchema)

export default ProductProfile

