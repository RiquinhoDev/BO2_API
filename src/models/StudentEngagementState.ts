// =====================================================
// 📁 src/models/StudentEngagementState.ts
// MODEL: Estado de engagement de cada aluno por produto
// =====================================================

import mongoose, { Document, Schema } from 'mongoose'

/**
 * Interface: Histórico de Tags
 * 
 * Cada vez que uma tag é aplicada/removida, registamos aqui
 */
export interface ITagHistory {
  tag: string                   // Tag que foi aplicada (ex: "CLAREZA_10D")
  level: number                 // Nível correspondente (1, 2, 3)
  appliedAt: Date              // Quando foi aplicada
  removedAt?: Date             // Quando foi removida (se foi)
  result?: 'RETURNED' | 'ESCALATED' | 'LOST' | 'MANUAL_REMOVAL'
  // RETURNED: Aluno voltou
  // ESCALATED: Escalou para próximo nível
  // LOST: Atingiu último nível e não voltou
  // MANUAL_REMOVAL: Removido manualmente por admin
}

/**
 * Interface: Student Engagement State
 * 
 * Mantém o estado atual de cada aluno para cada produto.
 * Um aluno pode ter múltiplos estados (um por produto).
 */
export interface IStudentEngagementState extends Document {
  // ===== IDENTIFICAÇÃO =====
  userId: mongoose.Types.ObjectId       // Referência ao User
  courseId?: mongoose.Types.ObjectId    // Referência ao Course (opcional)
  productCode: string                   // Código do produto (CLAREZA, OGI)
  
  // ===== ESTADO ATUAL =====
  currentState: 'ACTIVE' | 'AT_RISK' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3' | 'LOST'
  // ACTIVE: Aluno ativo (fazendo progresso)
  // AT_RISK: Perto de entrar no Nível 1 (5-9 dias sem atividade)
  // LEVEL_1/2/3: Em um nível específico
  // LOST: Atingiu último nível e não retornou
  
  // ===== ATIVIDADE =====
  daysSinceLastLogin: number            // Dias desde último login
  lastLogin?: Date                      // Data do último login
  lastProgress?: Date                   // Data da última ação de progresso
  lastProgressType?: string             // Tipo da última ação (LOGIN, REPORT_OPENED, etc)
  
  // ===== NÍVEL ATUAL =====
  currentLevel?: number                 // Nível atual (1, 2, 3, null se ACTIVE)
  currentTagAC?: string                 // Tag atual aplicada no AC
  levelAppliedAt?: Date                 // Quando o nível atual foi aplicado
  
  // ===== COOLDOWN =====
  cooldownUntil?: Date                  // Até quando não enviar próxima comunicação
  isInCooldown: boolean                 // Flag rápida para saber se está em cooldown
  
  // ===== HISTÓRICO =====
  tagsHistory: ITagHistory[]            // Todas as tags aplicadas/removidas
  totalEmailsSent: number               // Total de emails enviados
  totalReturns: number                  // Quantas vezes voltou após email
  
  // ===== ESTATÍSTICAS =====
  stats: {
    firstInactiveDate?: Date            // Primeira vez que ficou inativo
    totalDaysInactive: number           // Total de dias acumulados como inativo
    currentStreakInactive: number       // Streak atual de dias inativo
    longestStreakInactive: number       // Maior streak de inatividade
    averageTimeToReturn?: number        // Tempo médio para retornar (minutos)
  }
  
  // ===== TIMESTAMPS =====
  createdAt: Date
  updatedAt: Date
  lastEvaluatedAt?: Date                // Última vez que foi avaliado pelo CRON
  
  // ===== MÉTODOS =====
  checkCooldown(): boolean
  applyTag(tag: string, level: number): void
  removeTag(result: 'RETURNED' | 'ESCALATED' | 'LOST' | 'MANUAL_REMOVAL'): void
  markAsReturned(): void
  setCooldown(days: number): void
  updateDaysInactive(days: number): void
  registerProgress(progressType: string): void
}

/**
 * Schema do Mongoose
 */
const TagHistorySchema = new Schema<ITagHistory>({
  tag: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  level: {
    type: Number,
    required: true,
    min: 1
  },
  appliedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  removedAt: {
    type: Date
  },
  result: {
    type: String,
    enum: ['RETURNED', 'ESCALATED', 'LOST', 'MANUAL_REMOVAL']
  }
}, { _id: false })

const StudentEngagementStateSchema = new Schema<IStudentEngagementState>({
  // Identificação
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true  // Índice para buscar por usuário
  },
  courseId: {
    type: Schema.Types.ObjectId,
    ref: 'Course'
  },
  productCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true  // Índice para buscar por produto
  },
  
  // Estado atual
  currentState: {
    type: String,
    enum: ['ACTIVE', 'AT_RISK', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LOST'],
    default: 'ACTIVE',
    index: true  // Índice para filtrar por estado
  },
  
  // Atividade
  daysSinceLastLogin: {
    type: Number,
    default: 0,
    min: 0
  },
  lastLogin: {
    type: Date
  },
  lastProgress: {
    type: Date
  },
  lastProgressType: {
    type: String
  },
  
  // Nível atual
  currentLevel: {
    type: Number,
    min: 1
  },
  currentTagAC: {
    type: String,
    uppercase: true,
    trim: true
  },
  levelAppliedAt: {
    type: Date
  },
  
  // Cooldown
  cooldownUntil: {
    type: Date,
    index: true  // Índice para verificar cooldowns expirados
  },
  isInCooldown: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Histórico
  tagsHistory: {
    type: [TagHistorySchema],
    default: []
  },
  totalEmailsSent: {
    type: Number,
    default: 0,
    min: 0
  },
  totalReturns: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Estatísticas
  stats: {
    firstInactiveDate: Date,
    totalDaysInactive: {
      type: Number,
      default: 0,
      min: 0
    },
    currentStreakInactive: {
      type: Number,
      default: 0,
      min: 0
    },
    longestStreakInactive: {
      type: Number,
      default: 0,
      min: 0
    },
    averageTimeToReturn: Number
  },
  
  // Timestamps
  lastEvaluatedAt: Date
}, {
  timestamps: true,
  collection: 'studentengagementstates'
})

/**
 * Índices compostos
 */
// Buscar estado de um aluno específico em um produto
StudentEngagementStateSchema.index({ userId: 1, productCode: 1 }, { unique: true })

// Buscar alunos em cooldown que expirou
StudentEngagementStateSchema.index({ isInCooldown: 1, cooldownUntil: 1 })

// Buscar alunos por estado e produto
StudentEngagementStateSchema.index({ productCode: 1, currentState: 1 })

// Buscar alunos por dias de inatividade
StudentEngagementStateSchema.index({ productCode: 1, daysSinceLastLogin: 1 })

/**
 * Métodos do documento
 */
StudentEngagementStateSchema.methods = {
  /**
   * Verificar se está em cooldown
   */
  checkCooldown(): boolean {
    if (!this.cooldownUntil) return false
    return new Date() < this.cooldownUntil
  },
  
  /**
   * Aplicar tag
   */
  applyTag(tag: string, level: number) {
    this.currentTagAC = tag
    this.currentLevel = level
    this.levelAppliedAt = new Date()
    this.currentState = `LEVEL_${level}` as any
    
    // Adicionar ao histórico
    this.tagsHistory.push({
      tag,
      level,
      appliedAt: new Date()
    })
    
    this.totalEmailsSent++
  },
  
  /**
   * Remover tag atual
   */
  removeTag(result: 'RETURNED' | 'ESCALATED' | 'LOST' | 'MANUAL_REMOVAL') {
    if (this.tagsHistory.length > 0) {
      const lastTag = this.tagsHistory[this.tagsHistory.length - 1]
      lastTag.removedAt = new Date()
      lastTag.result = result
    }
    
    this.currentTagAC = undefined
    this.currentLevel = undefined
    this.levelAppliedAt = undefined
  },
  
  /**
   * Marcar como retornado
   */
  markAsReturned() {
    this.removeTag('RETURNED')
    this.currentState = 'ACTIVE'
    this.totalReturns++
    this.cooldownUntil = undefined
    this.isInCooldown = false
    
    // Resetar streak de inatividade
    this.stats.currentStreakInactive = 0
  },
  
  /**
   * Definir cooldown
   */
  setCooldown(days: number) {
    const cooldownDate = new Date()
    cooldownDate.setDate(cooldownDate.getDate() + days)
    this.cooldownUntil = cooldownDate
    this.isInCooldown = true
  },
  
  /**
   * Atualizar dias de inatividade
   */
  updateDaysInactive(days: number) {
    this.daysSinceLastLogin = days
    this.stats.currentStreakInactive = days
    
    // Atualizar maior streak se necessário
    if (days > this.stats.longestStreakInactive) {
      this.stats.longestStreakInactive = days
    }
    
    // Definir estado baseado em dias
    if (days === 0) {
      this.currentState = 'ACTIVE'
    } else if (days >= 5 && days < 10) {
      this.currentState = 'AT_RISK'
    }
    // Nota: LEVEL_1/2/3 são definidos quando tag é aplicada
  },
  
  /**
   * Registar progresso
   */
  registerProgress(progressType: string) {
    this.lastProgress = new Date()
    this.lastProgressType = progressType
    this.daysSinceLastLogin = 0
    
    // Se estava inativo, resetar
    if (this.currentState !== 'ACTIVE') {
      this.markAsReturned()
    }
  }
}

/**
 * Métodos estáticos
 */
StudentEngagementStateSchema.statics = {
  /**
   * Obter ou criar estado de um aluno
   */
  async getOrCreate(userId: string, productCode: string) {
    let state = await this.findOne({ userId, productCode })
    
    if (!state) {
      state = await this.create({
        userId,
        productCode,
        currentState: 'ACTIVE',
        daysSinceLastLogin: 0,
        tagsHistory: [],
        totalEmailsSent: 0,
        totalReturns: 0,
        stats: {
          totalDaysInactive: 0,
          currentStreakInactive: 0,
          longestStreakInactive: 0
        }
      })
    }
    
    return state
  },
  
  /**
   * Buscar alunos por estado
   */
  async findByState(productCode: string, state: string) {
    return this.find({ productCode, currentState: state })
      .populate('userId')
      .sort({ daysSinceLastLogin: -1 })
  },
  
  /**
   * Buscar alunos elegíveis para avaliação
   */
  async findEligibleForEvaluation(productCode: string) {
    return this.find({
      productCode,
      $or: [
        { isInCooldown: false },
        { cooldownUntil: { $lt: new Date() } }
      ]
    }).populate('userId')
  }
}

/**
 * Middleware: Atualizar isInCooldown antes de salvar
 */
StudentEngagementStateSchema.pre('save', function(next) {
  // Atualizar flag de cooldown
  this.isInCooldown = this.checkCooldown()
  next()
})

/**
 * Exportar model
 */
const StudentEngagementState: mongoose.Model<IStudentEngagementState> = mongoose.models.StudentEngagementState ||
  mongoose.model<IStudentEngagementState>(
    'StudentEngagementState',
    StudentEngagementStateSchema
  )

export default StudentEngagementState

