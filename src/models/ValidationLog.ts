// src/models/ValidationLog.ts
// Modelo de leitura da coleção `validationLogs` (escrita pelo backend de login api/API).
// Ambos os backends partilham a mesma DB `riquinho`.
import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IValidationLog extends Document {
  email?: string
  name?: string
  discordId?: string
  classId?: string
  className?: string
  outcome?: string
  errorCode?: string
  httpStatus?: number
  message?: string
  ip?: string
  userAgent?: string
  finalDate?: Date | null
  createdAt: Date
}

const ValidationLogSchema = new Schema(
  {
    email: { type: String },
    name: String,
    discordId: String,
    classId: String,
    className: String,
    outcome: String,
    errorCode: String,
    httpStatus: Number,
    message: String,
    ip: String,
    userAgent: String,
    finalDate: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'validationLogs', strict: false }
)

let ValidationLog: Model<IValidationLog>

try {
  ValidationLog = mongoose.model<IValidationLog>('ValidationLog')
} catch (error) {
  ValidationLog = mongoose.model<IValidationLog>('ValidationLog', ValidationLogSchema, 'validationLogs')
}

export default ValidationLog
