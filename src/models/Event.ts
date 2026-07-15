// ════════════════════════════════════════════════════════════
// 📁 src/models/Event.ts
// Modelo de Eventos / Lives
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export interface IEventLink {
  name: string            // "Zoom", "Apresentação", "Replay YouTube"
  url: string             // URL completa
}

export interface IEvent extends Document {
  // Identificação
  title: string
  description?: string

  // Tipo
  eventType: string                // "portfolio", "mentoria", "boas_vindas", "live_mensal"
  color: string                    // "#3b82f6"

  // Data/Hora
  scheduledAt: Date
  endsAt?: Date
  duration: number                 // minutos (default 60)
  timezone: string                 // "Europe/Lisbon"

  // Recorrência
  recurrence: 'none' | 'weekly' | 'monthly'
  recurrenceDayOfMonth?: number
  recurrenceDayOfWeek?: number

  // Plataforma principal
  platform: 'zoom' | 'discord' | 'youtube' | 'presencial' | 'outro'

  // Links (múltiplos — Zoom, replay, apresentação, etc.)
  links: IEventLink[]

  // Imagem de capa
  coverImage?: string

  // Público-alvo
  targetClasses: string[]          // IDs turmas (vazio = todas)
  isPublic: boolean

  // Interacção
  interestedUsers: string[]        // emails
  interestedCount: number

  // Estado
  status: 'draft' | 'published' | 'live' | 'completed' | 'cancelled'

  // Meta
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

// ─────────────────────────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────────────────────────

const EventLinkSchema = new Schema<IEventLink>({
  name: { type: String, required: true },
  url: { type: String, required: true },
}, { _id: false })

const EventSchema = new Schema<IEvent>({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },

  eventType: {
    type: String,
    required: true,
    index: true,
  },
  color: { type: String, default: '#3b82f6' },

  scheduledAt: { type: Date, required: true, index: true },
  endsAt: { type: Date },
  duration: { type: Number, default: 60 },
  timezone: { type: String, default: 'Europe/Lisbon' },

  recurrence: {
    type: String,
    enum: ['none', 'weekly', 'monthly'],
    default: 'none',
  },
  recurrenceDayOfMonth: { type: Number },
  recurrenceDayOfWeek: { type: Number },

  platform: {
    type: String,
    enum: ['zoom', 'discord', 'youtube', 'presencial', 'outro'],
    default: 'zoom',
  },

  links: { type: [EventLinkSchema], default: [] },

  coverImage: { type: String },

  targetClasses: [{ type: String }],
  isPublic: { type: Boolean, default: true },

  interestedUsers: [{ type: String }],
  interestedCount: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ['draft', 'published', 'live', 'completed', 'cancelled'],
    default: 'draft',
    index: true,
  },

  createdBy: { type: String, default: 'system' },
}, {
  timestamps: true,
  collection: 'events',
})

// ─────────────────────────────────────────────────────────────
// ÍNDICES
// ─────────────────────────────────────────────────────────────

EventSchema.index({ status: 1, scheduledAt: 1 })
EventSchema.index({ eventType: 1, scheduledAt: 1 })

const Event: mongoose.Model<IEvent> = mongoose.models.Event || mongoose.model<IEvent>('Event', EventSchema)

export default Event
