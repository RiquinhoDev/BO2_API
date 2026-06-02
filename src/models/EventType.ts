// ════════════════════════════════════════════════════════════
// 📁 src/models/EventType.ts
// Tipos de evento (editáveis via backoffice)
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose'

export interface IEventType extends Document {
  code: string              // "portfolio", "mentoria", etc.
  label: string             // "Live de Portfólio"
  color: string             // "#3b82f6"
  icon?: string             // emoji
  defaultDuration: number   // minutos
  defaultPlatform: string   // "zoom"
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const EventTypeSchema = new Schema<IEventType>({
  code: { type: String, required: true, unique: true, lowercase: true, trim: true },
  label: { type: String, required: true, trim: true },
  color: { type: String, default: '#3b82f6' },
  icon: { type: String },
  defaultDuration: { type: Number, default: 60 },
  defaultPlatform: { type: String, default: 'zoom' },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  collection: 'eventtypes',
})

const EventType = mongoose.models.EventType || mongoose.model<IEventType>('EventType', EventTypeSchema)

export default EventType
