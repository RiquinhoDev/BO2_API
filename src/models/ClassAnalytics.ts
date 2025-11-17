// src/models/ClassAnalytics.ts - Modelo para Cache de Métricas da Turma
import mongoose, { Schema, Document } from 'mongoose'

export interface IClassAnalytics extends Document {
  classId: string
  className: string
  
  // ✅ MÉTRICAS BÁSICAS
  totalStudents: number
  activeStudents: number
  inactiveStudents: number
   
  // ✅ MÉTRICAS DE ENGAGEMENT
  averageEngagement: number
  engagementDistribution: {
    muito_alto: number    // ≥80
    alto: number         // 60-79
    medio: number        // 40-59
    baixo: number        // 20-39
    muito_baixo: number  // <20
  }
  
  // ✅ MÉTRICAS DE PROGRESSO
  averageProgress: number
  progressDistribution: {
    completed: number      // 100%
    advanced: number      // 75-99%
    intermediate: number  // 50-74%
    beginner: number     // 25-49%
    minimal: number      // <25%
  }
  
  // ✅ MÉTRICAS DE ATIVIDADE
  averageAccessCount: number
  activityDistribution: {
    very_active: number   // ≥50 acessos
    active: number       // 20-49 acessos
    moderate: number     // 10-19 acessos
    low: number         // 1-9 acessos
    inactive: number    // 0 acessos
  }
  
  // ✅ ÚLTIMOS ACESSOS
  lastAccess: {
    today: number
    week: number
    month: number
    older: number
  }
  
  // ✅ HEALTH SCORE E FATORES
  healthScore: number
  healthFactors: {
    engagement: number
    activity: number
    progress: number
    retention: number
  }
  
  // ✅ ALERTAS AUTOMÁTICOS
  alerts: Array<{
    type: 'warning' | 'info' | 'success'
    message: string
    priority: 'high' | 'medium' | 'low'
    category: 'engagement' | 'progress' | 'activity' | 'retention'
  }>
  
  // ✅ METADADOS DE CACHE
  lastCalculatedAt: Date
  calculationDuration: number // em milissegundos
  studentsProcessed: number
  dataVersion: string // Para invalidar cache quando necessário
  
  // ✅ CONFIGURAÇÕES
  autoUpdate: boolean
  cacheValidityHours: number
}

const ClassAnalyticsSchema = new Schema<IClassAnalytics>({
  classId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  className: {
    type: String,
    required: true,
    trim: true
  },
  
  // Métricas básicas
  totalStudents: {
    type: Number,
    default: 0,
    min: 0
  },
  activeStudents: {
    type: Number,
    default: 0,
    min: 0
  },
  inactiveStudents: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Métricas de engagement
  averageEngagement: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  engagementDistribution: {
    muito_alto: { type: Number, default: 0, min: 0 },
    alto: { type: Number, default: 0, min: 0 },
    medio: { type: Number, default: 0, min: 0 },
    baixo: { type: Number, default: 0, min: 0 },
    muito_baixo: { type: Number, default: 0, min: 0 }
  },
  
  // Métricas de progresso
  averageProgress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  progressDistribution: {
    completed: { type: Number, default: 0, min: 0 },
    advanced: { type: Number, default: 0, min: 0 },
    intermediate: { type: Number, default: 0, min: 0 },
    beginner: { type: Number, default: 0, min: 0 },
    minimal: { type: Number, default: 0, min: 0 }
  },
  
  // Métricas de atividade
  averageAccessCount: {
    type: Number,
    default: 0,
    min: 0
  },
  activityDistribution: {
    very_active: { type: Number, default: 0, min: 0 },
    active: { type: Number, default: 0, min: 0 },
    moderate: { type: Number, default: 0, min: 0 },
    low: { type: Number, default: 0, min: 0 },
    inactive: { type: Number, default: 0, min: 0 }
  },
  
  // Últimos acessos
  lastAccess: {
    today: { type: Number, default: 0, min: 0 },
    week: { type: Number, default: 0, min: 0 },
    month: { type: Number, default: 0, min: 0 },
    older: { type: Number, default: 0, min: 0 }
  },
  
  // Health Score
  healthScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  healthFactors: {
    engagement: { type: Number, default: 0, min: 0, max: 100 },
    activity: { type: Number, default: 0, min: 0, max: 100 },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    retention: { type: Number, default: 0, min: 0, max: 100 }
  },
  
  // Alertas
  alerts: [{
    type: {
      type: String,
      enum: ['warning', 'info', 'success'],
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      required: true
    },
    category: {
      type: String,
      enum: ['engagement', 'progress', 'activity', 'retention'],
      required: true
    }
  }],
  
  // Metadados de cache
  lastCalculatedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  calculationDuration: {
    type: Number,
    default: 0,
    min: 0
  },
  studentsProcessed: {
    type: Number,
    default: 0,
    min: 0
  },
  dataVersion: {
    type: String,
    default: '1.0.0'
  },
  
  // Configurações
  autoUpdate: {
    type: Boolean,
    default: true
  },
  cacheValidityHours: {
    type: Number,
    default: 6, // Cache válido por 6 horas
    min: 1,
    max: 168 // Máximo 1 semana
  }
}, {
  timestamps: true,
  collection: 'classAnalytics'
})

// ✅ ÍNDICES PARA PERFORMANCE
ClassAnalyticsSchema.index({ classId: 1 }, { unique: true })
ClassAnalyticsSchema.index({ lastCalculatedAt: -1 })
ClassAnalyticsSchema.index({ healthScore: -1 })
ClassAnalyticsSchema.index({ averageEngagement: -1 })
ClassAnalyticsSchema.index({ totalStudents: -1 })

// ✅ MÉTODOS ÚTEIS
ClassAnalyticsSchema.methods.isCacheValid = function(): boolean {
  const now = new Date()
  const cacheAge = now.getTime() - this.lastCalculatedAt.getTime()
  const maxAge = this.cacheValidityHours * 60 * 60 * 1000 // Converter para milissegundos
  
  return cacheAge < maxAge
}

ClassAnalyticsSchema.methods.getCacheAge = function(): number {
  const now = new Date()
  return Math.floor((now.getTime() - this.lastCalculatedAt.getTime()) / (1000 * 60)) // em minutos
}

ClassAnalyticsSchema.methods.shouldAutoUpdate = function(): boolean {
  return this.autoUpdate && !this.isCacheValid()
}

// ✅ MÉTODO ESTÁTICO PARA VERIFICAR SE PRECISA ATUALIZAR
ClassAnalyticsSchema.statics.needsUpdate = async function(classId: string): Promise<boolean> {
  const analytics = await this.findOne({ classId })
  
  if (!analytics) {
    return true // Não existe, precisa criar
  }
  
  return !analytics.isCacheValid()
}

// ✅ MIDDLEWARE PRE-SAVE
ClassAnalyticsSchema.pre('save', function(next) {
  // Garantir que as distribuições somam ao total de estudantes
  const engagementTotal = Object.values(this.engagementDistribution).reduce((a, b) => a + b, 0)
  const progressTotal = Object.values(this.progressDistribution).reduce((a, b) => a + b, 0)
  const activityTotal = Object.values(this.activityDistribution).reduce((a, b) => a + b, 0)
  
  if (engagementTotal !== this.totalStudents && this.totalStudents > 0) {
    console.warn(`⚠️ Distribuição de engagement não confere: ${engagementTotal} vs ${this.totalStudents}`)
  }
  
  if (progressTotal !== this.totalStudents && this.totalStudents > 0) {
    console.warn(`⚠️ Distribuição de progresso não confere: ${progressTotal} vs ${this.totalStudents}`)
  }
  
  if (activityTotal !== this.totalStudents && this.totalStudents > 0) {
    console.warn(`⚠️ Distribuição de atividade não confere: ${activityTotal} vs ${this.totalStudents}`)
  }
  
  next()
})

// ✅ VIRTUAL PARA TAXA DE ATIVIDADE
ClassAnalyticsSchema.virtual('activityRate').get(function() {
  if (this.totalStudents === 0) return 0
  return Math.round((this.activeStudents / this.totalStudents) * 100)
})

// ✅ VIRTUAL PARA TAXA DE RETENÇÃO
ClassAnalyticsSchema.virtual('retentionRate').get(function() {
  const recent = this.lastAccess.today + this.lastAccess.week
  if (this.totalStudents === 0) return 0
  return Math.round((recent / this.totalStudents) * 100)
})

export const ClassAnalytics = mongoose.models.ClassAnalytics || 
  mongoose.model<IClassAnalytics>('ClassAnalytics', ClassAnalyticsSchema)