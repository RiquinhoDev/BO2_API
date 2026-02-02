// ═══════════════════════════════════════════════════════════
// 📸 AC NATIVE TAGS SNAPSHOT
// Guarda tags NATIVAS do ActiveCampaign (não-BO)
// CRÍTICO: Protege tags criadas manualmente na AC
// ═══════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose'

export interface IACNativeTagsSnapshot extends Document {
  email: string // Email do contacto
  contactId?: string // ID do contacto na AC (se disponível)

  // Tags nativas (NÃO-BO) capturadas da AC
  nativeTags: string[]

  // Tags BO (para comparação)
  boTags: string[]

  // Metadata
  capturedAt: Date
  lastSyncAt: Date
  syncCount: number

  // Histórico de mudanças de tags nativas
  history: Array<{
    timestamp: Date
    action: 'ADDED' | 'REMOVED' | 'INITIAL_CAPTURE'
    tags: string[]
    source: string // Ex: 'DAILY_PIPELINE', 'TAG_RULES_ONLY', 'MANUAL_SYNC'
  }>
}

const ACNativeTagsSnapshotSchema = new Schema<IACNativeTagsSnapshot>(
  {
    email: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true
    },

    contactId: {
      type: String,
      index: true
    },

    nativeTags: [{
      type: String,
      trim: true
    }],

    boTags: [{
      type: String,
      trim: true
    }],

    capturedAt: {
      type: Date,
      default: Date.now
    },

    lastSyncAt: {
      type: Date,
      default: Date.now
    },

    syncCount: {
      type: Number,
      default: 0
    },

    history: [{
      timestamp: {
        type: Date,
        default: Date.now
      },
      action: {
        type: String,
        enum: ['ADDED', 'REMOVED', 'INITIAL_CAPTURE'],
        required: true
      },
      tags: [{
        type: String
      }],
      source: {
        type: String,
        default: 'UNKNOWN'
      }
    }]
  },
  {
    timestamps: true,
    collection: 'ac_native_tags_snapshots'
  }
)

// Index composto para queries rápidas
ACNativeTagsSnapshotSchema.index({ email: 1, lastSyncAt: -1 })

const ACNativeTagsSnapshot = mongoose.model<IACNativeTagsSnapshot>(
  'ACNativeTagsSnapshot',
  ACNativeTagsSnapshotSchema
)

export default ACNativeTagsSnapshot
