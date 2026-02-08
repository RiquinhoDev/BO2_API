// src/models/GuruMonthlySnapshot.ts - Modelo para snapshots mensais de subscrições Guru
import mongoose, { Schema, Document } from 'mongoose'

export interface IGuruMonthlySnapshot extends Document {
  // Identificação do período
  year: number
  month: number // 1-12
  snapshotDate: Date // Data em que o snapshot foi tirado

  // Totais por status
  totals: {
    active: number
    pastdue: number
    canceled: number
    expired: number
    pending: number
    refunded: number
    suspended: number
    total: number
  }

  // Separação por tipo de plano (anual vs mensal)
  byPlanType: {
    annual: {
      active: number
      canceled: number
      total: number
    }
    monthly: {
      active: number
      canceled: number
      total: number
    }
  }

  // Movimentos do mês (entradas e saídas)
  movements: {
    newSubscriptions: number // Novas subscrições criadas neste mês
    cancellations: number // Cancelamentos neste mês
    reactivations: number // Reativações neste mês
    expirations: number // Expirações neste mês
  }

  // Churn calculado para este mês
  churn: {
    rate: number // Taxa de churn (%)
    retention: number // Taxa de retenção (%)
    baseAtStart: number // Base no início do mês
    lostSubscriptions: number // Subscrições perdidas
  }

  // Metadata
  source: 'guru_api' | 'webhook' | 'manual' // Como foi criado
  dataQuality: 'complete' | 'estimated' | 'partial' // Qualidade dos dados
  notes?: string

  createdAt: Date
  updatedAt: Date
}

const GuruMonthlySnapshotSchema = new Schema<IGuruMonthlySnapshot>(
  {
    year: {
      type: Number,
      required: true,
      min: 2020,
      max: 2100
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12
    },
    snapshotDate: {
      type: Date,
      required: true,
      default: Date.now
    },

    totals: {
      active: { type: Number, default: 0 },
      pastdue: { type: Number, default: 0 },
      canceled: { type: Number, default: 0 },
      expired: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      refunded: { type: Number, default: 0 },
      suspended: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },

    byPlanType: {
      annual: {
        active: { type: Number, default: 0 },
        canceled: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
      },
      monthly: {
        active: { type: Number, default: 0 },
        canceled: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
      }
    },

    movements: {
      newSubscriptions: { type: Number, default: 0 },
      cancellations: { type: Number, default: 0 },
      reactivations: { type: Number, default: 0 },
      expirations: { type: Number, default: 0 }
    },

    churn: {
      rate: { type: Number, default: 0 },
      retention: { type: Number, default: 0 },
      baseAtStart: { type: Number, default: 0 },
      lostSubscriptions: { type: Number, default: 0 }
    },

    source: {
      type: String,
      enum: ['guru_api', 'webhook', 'manual'],
      default: 'guru_api'
    },

    dataQuality: {
      type: String,
      enum: ['complete', 'estimated', 'partial'],
      default: 'complete'
    },

    notes: { type: String }
  },
  {
    timestamps: true
  }
)

// Índice único: um snapshot por mês/ano
GuruMonthlySnapshotSchema.index({ year: 1, month: 1 }, { unique: true })

// Índice para queries por data
GuruMonthlySnapshotSchema.index({ snapshotDate: -1 })

const GuruMonthlySnapshot = mongoose.model<IGuruMonthlySnapshot>(
  'GuruMonthlySnapshot',
  GuruMonthlySnapshotSchema
)

export default GuruMonthlySnapshot
