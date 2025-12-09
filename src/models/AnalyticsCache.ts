// ════════════════════════════════════════════════════════════════════
// 📊 ANALYTICS CACHE MODEL
// ════════════════════════════════════════════════════════════════════
// Objetivo: Cachear métricas calculadas para melhorar performance
// Evita recalcular métricas complexas a cada request
// ════════════════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose'

// ═══════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════

/**
 * Métricas calculadas e cacheadas
 */
export interface ICacheMetrics {
  // KPIs Principais
  totalStudents: number
  activeStudents: number
  newStudents: number
  churnedStudents: number
  
  // Receita
  totalRevenue: number
  mrr: number  // Monthly Recurring Revenue
  arr: number  // Annual Recurring Revenue
  
  // Taxas
  churnRate: number      // % de alunos que saíram
  retentionRate: number  // % de alunos que ficaram
  growthRate: number     // % de crescimento vs período anterior
  
  // Valores Médios
  avgLTV: number         // Lifetime Value médio
  avgOrderValue: number  // Valor médio de compra
  
  // Engagement
  avgEngagement: number
  
  // Comparação com período anterior
  comparison?: {
    totalStudents: { value: number; change: number; changePercent: number }
    revenue: { value: number; change: number; changePercent: number }
    churnRate: { value: number; change: number; changePercent: number }
    growthRate: { value: number; change: number; changePercent: number }
  }
}

/**
 * Documento do AnalyticsCache
 */
export interface IAnalyticsCache extends Document {
  // Identificação
  productId?: mongoose.Types.ObjectId | null  // null = todos os produtos
  platform?: 'hotmart' | 'curseduca' | 'discord' | null  // null = todas as plataformas
  
  // Período
  period: 'daily' | 'weekly' | 'monthly' | 'yearly'
  startDate: Date
  endDate: Date
  
  // Métricas calculadas
  metrics: ICacheMetrics
  
  // Dados temporais (para gráficos)
  timeSeries?: {
    date: Date
    value: number
    label?: string
  }[]
  
  // Meta
  calculatedAt: Date
  expiresAt: Date
  version: string  // Para invalidar cache quando lógica muda
  
  // Timestamps
  createdAt: Date
  updatedAt: Date
  
  // ✅ MÉTODOS (declarações TypeScript)
  isValid(): boolean
  needsRefresh(): boolean
}

// ═══════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════

const AnalyticsCacheSchema = new Schema<IAnalyticsCache>(
  {
    // ──────────────────────────────────────────────────────────
    // Identificação
    // ──────────────────────────────────────────────────────────
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
      index: true
    },
    
    platform: {
      type: String,
      enum: ['hotmart', 'curseduca', 'discord', null],
      default: null,
      index: true
    },
    
    // ──────────────────────────────────────────────────────────
    // Período
    // ──────────────────────────────────────────────────────────
    period: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly'],
      required: true,
      index: true
    },
    
    startDate: {
      type: Date,
      required: true,
      index: true
    },
    
    endDate: {
      type: Date,
      required: true,
      index: true
    },
    
    // ──────────────────────────────────────────────────────────
    // Métricas (JSON complexo)
    // ──────────────────────────────────────────────────────────
    metrics: {
      type: Schema.Types.Mixed,
      required: true,
      default: {}
    },
    
    // ──────────────────────────────────────────────────────────
    // Time Series (para gráficos)
    // ──────────────────────────────────────────────────────────
    timeSeries: {
      type: [
        {
          date: { type: Date, required: true },
          value: { type: Number, required: true },
          label: { type: String }
        }
      ],
      default: []
    },
    
    // ──────────────────────────────────────────────────────────
    // Meta
    // ──────────────────────────────────────────────────────────
    calculatedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    
    version: {
      type: String,
      default: '1.0.0',
      required: true
    }
  },
  {
    timestamps: true,
    collection: 'analytics_cache'
  }
)

// ═══════════════════════════════════════════════════════════════════
// INDEXES
// ═══════════════════════════════════════════════════════════════════

// Index composto para queries rápidas
AnalyticsCacheSchema.index(
  { productId: 1, platform: 1, period: 1, startDate: 1 },
  { unique: true }
)

// Index para limpeza automática de cache expirado
AnalyticsCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// ═══════════════════════════════════════════════════════════════════
// METHODS
// ═══════════════════════════════════════════════════════════════════

/**
 * Verificar se cache ainda é válido
 */
AnalyticsCacheSchema.methods.isValid = function(): boolean {
  return this.expiresAt > new Date()
}

/**
 * Verificar se cache precisa ser renovado (50% do tempo de expiração)
 */
AnalyticsCacheSchema.methods.needsRefresh = function(): boolean {
  const now = new Date().getTime()
  const calculated = this.calculatedAt.getTime()
  const expires = this.expiresAt.getTime()
  const halfLife = calculated + (expires - calculated) / 2
  
  return now > halfLife
}

// ═══════════════════════════════════════════════════════════════════
// STATICS
// ═══════════════════════════════════════════════════════════════════

/**
 * Buscar cache válido ou retornar null
 */
AnalyticsCacheSchema.statics.findValidCache = async function(
  period: string,
  startDate: Date,
  endDate: Date,
  productId?: string | null,
  platform?: string | null
) {
  const cache = await this.findOne({
    period,
    startDate: { $lte: startDate },
    endDate: { $gte: endDate },
    productId: productId || null,
    platform: platform || null,
    expiresAt: { $gt: new Date() }
  }).sort({ calculatedAt: -1 })
  
  return cache
}

/**
 * Limpar cache antigo/expirado
 */
AnalyticsCacheSchema.statics.cleanExpired = async function() {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() }
  })
  
  return result.deletedCount
}

/**
 * Invalidar cache de um produto específico
 */
AnalyticsCacheSchema.statics.invalidateProduct = async function(productId: string) {
  const result = await this.deleteMany({
    productId: productId
  })
  
  return result.deletedCount
}

/**
 * Invalidar todo o cache (quando lógica muda)
 */
AnalyticsCacheSchema.statics.invalidateAll = async function() {
  const result = await this.deleteMany({})
  
  return result.deletedCount
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export default mongoose.model<IAnalyticsCache>('AnalyticsCache', AnalyticsCacheSchema)
