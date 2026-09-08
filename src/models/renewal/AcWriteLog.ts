import mongoose, { Document, Schema } from 'mongoose'

export interface IAcWriteLog extends Document {
  quando: Date
  servico: 'expiracao' | 'dataCompra' | 'turmaTag' | 'reembolso'
  email: string
  campo: number
  antes: string | null
  depois: string | null
  accao: 'escrito' | 'recusado'
  motivo?: string
  dryRun: boolean
  idempotencyKey: string
  tagId?: string | null
  tagNome?: string | null
}

const acWriteLogSchema = new Schema<IAcWriteLog>(
  {
    quando: { type: Date, required: true },
    servico: { type: String, enum: ['expiracao', 'dataCompra', 'turmaTag', 'reembolso'], required: true },
    email: { type: String, required: true },
    campo: { type: Number, required: true },
    antes: { type: String, default: null },
    depois: { type: String, default: null },
    accao: { type: String, enum: ['escrito', 'recusado'], required: true },
    motivo: { type: String },
    dryRun: { type: Boolean, required: true },
    idempotencyKey: { type: String, required: true },
    tagId: { type: String, default: null },
    tagNome: { type: String, default: null }
  },
  { collection: 'acwritelogs' }
)

acWriteLogSchema.index({ email: 1 })
acWriteLogSchema.index({ quando: 1 })
acWriteLogSchema.index({ idempotencyKey: 1 }, { unique: true })

const AcWriteLog = (mongoose.models.AcWriteLog ||
  mongoose.model<IAcWriteLog>('AcWriteLog', acWriteLogSchema)) as mongoose.Model<IAcWriteLog>

export default AcWriteLog
