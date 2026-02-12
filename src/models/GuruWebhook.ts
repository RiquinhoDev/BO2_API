// src/models/GuruWebhook.ts - Modelo para guardar webhooks da Guru
import mongoose, { Schema, model, Document } from "mongoose"
import { GuruSubscriptionStatus, GuruWebhookEvent } from "../types/guru.types"

// ═══════════════════════════════════════════════════════════
// INTERFACE
// ═══════════════════════════════════════════════════════════

export interface IGuruWebhook extends Document {
  // Identificadores (X-Request-ID para idempotência)
  requestId: string
  subscriptionCode: string
  email: string
  guruContactId?: string

  // Evento
  event: GuruWebhookEvent
  receivedAt: Date

  // Status
  status: GuruSubscriptionStatus
  processed: boolean
  processedAt?: Date

  // Origem do webhook
  source: 'guru' | 'manual'

  // Payload completo
  rawData: object

  // Erros (se houver)
  error?: string

  // Timestamps automáticos
  createdAt: Date
  updatedAt: Date
}

// ═══════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════

const guruWebhookSchema = new Schema<IGuruWebhook>({
  // X-Request-ID para garantir idempotência
  requestId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Dados da subscrição
  subscriptionCode: {
    type: String,
    required: true,
    index: true
  },

  // Email do contacto (normalizado para lowercase)
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },

  // ID do contacto na Guru
  guruContactId: {
    type: String,
    sparse: true
  },

  // Tipo de evento
  event: {
    type: String,
    required: true,
    enum: [
      'subscription.created',
      'subscription.activated',
      'subscription.renewed',
      'subscription.canceled',
      'subscription.expired',
      'subscription.pastdue',
      'subscription.refunded',
      'subscription.suspended',
      'subscription.updated',
      'payment.approved',
      'payment.refused',
      'payment.refunded',
      'payment.chargeback'
    ]
  },

  // Data de recepção
  receivedAt: {
    type: Date,
    default: Date.now
  },

  // Status da subscrição no momento do webhook
  status: {
    type: String,
    required: true,
    enum: ['active', 'pastdue', 'canceled', 'expired', 'pending', 'refunded', 'suspended']
  },

  // Controlo de processamento
  processed: {
    type: Boolean,
    default: false,
    index: true
  },
  processedAt: {
    type: Date
  },

  // Origem do webhook (Guru ou teste manual)
  source: {
    type: String,
    enum: ['guru', 'manual'],
    default: 'manual',
    index: true
  },

  // Payload completo para auditoria
  rawData: {
    type: Schema.Types.Mixed,
    required: true
  },

  // Mensagem de erro (se processamento falhou)
  error: {
    type: String
  }
}, {
  timestamps: true,
  collection: 'guru_webhooks'
})

// ═══════════════════════════════════════════════════════════
// ÍNDICES COMPOSTOS
// ═══════════════════════════════════════════════════════════

// Para queries de histórico por email
guruWebhookSchema.index({ email: 1, receivedAt: -1 })

// Para reprocessamento de webhooks falhados
guruWebhookSchema.index({ processed: 1, receivedAt: 1 })

// Para estatísticas por status
guruWebhookSchema.index({ status: 1, receivedAt: -1 })

// Para limpeza de webhooks antigos
guruWebhookSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }) // TTL: 90 dias

// ═══════════════════════════════════════════════════════════
// MÉTODOS ESTÁTICOS
// ═══════════════════════════════════════════════════════════

guruWebhookSchema.statics.findByRequestId = function(requestId: string) {
  return this.findOne({ requestId })
}

guruWebhookSchema.statics.findByEmail = function(email: string, limit = 50) {
  return this.find({ email: email.toLowerCase().trim() })
    .sort({ receivedAt: -1 })
    .limit(limit)
}

guruWebhookSchema.statics.getUnprocessed = function(limit = 100) {
  return this.find({ processed: false })
    .sort({ receivedAt: 1 })
    .limit(limit)
}

guruWebhookSchema.statics.getStats = async function() {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [total, today, processed, failed, byStatus] = await Promise.all([
    this.countDocuments(),
    this.countDocuments({ receivedAt: { $gte: todayStart } }),
    this.countDocuments({ processed: true, error: { $exists: false } }),
    this.countDocuments({ error: { $exists: true, $ne: null } }),
    this.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
  ])

  const statusCounts = byStatus.reduce((acc: any, item: any) => {
    acc[item._id] = item.count
    return acc
  }, {})

  return {
    total,
    today,
    processed,
    failed,
    byStatus: statusCounts
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default mongoose.models.GuruWebhook || model<IGuruWebhook>("GuruWebhook", guruWebhookSchema)
