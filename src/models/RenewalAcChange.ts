// ════════════════════════════════════════════════════════════
// 📁 src/models/RenewalAcChange.ts
// Change set do sync Renovação OGI → ActiveCampaign (Fase B).
//
// Cada documento = UMA acção atómica na AC, planeada antes de ser
// executada. O plano é gerado sem tocar na AC (dry-run persistido);
// a execução é um passo separado, com guards e switches próprios.
// Ver RENOVACAO_OGI_BO_PLAN.md (secções 11 e 13).
//
// Ciclo de vida:
//   PLANNED → APPROVED → APPLIED
//                      ↘ FAILED  (re-tentável)
//   PLANNED/APPROVED → EXPIRED   (plano velho, nunca executado)
//   APPLIED → REVERTED           (desfeito com os valores "before")
//   PLANNED → BLOCKED            (guard recusou; fica registado porquê)
// ════════════════════════════════════════════════════════════

import mongoose, { Document, Schema } from 'mongoose'

export type RenewalAcAction = 'UPDATE_EXPIRY' | 'APPLY_TAG' | 'REMOVE_TAG'
export type RenewalAcSource = 'CLASS_CHANGE' | 'REFUND'
export type RenewalAcStatus =
  | 'PLANNED'
  | 'APPROVED'
  | 'APPLIED'
  | 'FAILED'
  | 'REVERTED'
  | 'EXPIRED'
  | 'BLOCKED'

export interface IRenewalAcChange extends Document {
  email: string
  userId?: mongoose.Types.ObjectId

  action: RenewalAcAction
  source: RenewalAcSource
  status: RenewalAcStatus

  // O que vai ser feito (e o que lá estava antes, para reverter)
  payload: {
    fieldId?: number // UPDATE_EXPIRY: id do custom field AC (332)
    tagName?: string // APPLY_TAG / REMOVE_TAG
    before?: string | null // valor/estado na AC antes de aplicar
    after?: string | null // valor pretendido
  }

  // Contexto humano — o que originou a alteração
  context: {
    previousClassName?: string
    newClassName?: string
    refundedAt?: Date
    note?: string
  }

  planBatchId: string // agrupa todas as changes de um generatePlan()
  sourceRef?: string // ex: id do StudentClassHistory que originou

  plannedAt: Date
  approvedAt?: Date
  approvedBy?: string
  appliedAt?: Date
  revertedAt?: Date
  blockedReason?: string
  error?: string
  attempts: number

  createdAt: Date
  updatedAt: Date
}

const renewalAcChangeSchema = new Schema<IRenewalAcChange>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },

    action: {
      type: String,
      enum: ['UPDATE_EXPIRY', 'APPLY_TAG', 'REMOVE_TAG'],
      required: true
    },
    source: {
      type: String,
      enum: ['CLASS_CHANGE', 'REFUND'],
      required: true
    },
    status: {
      type: String,
      enum: ['PLANNED', 'APPROVED', 'APPLIED', 'FAILED', 'REVERTED', 'EXPIRED', 'BLOCKED'],
      default: 'PLANNED',
      index: true
    },

    payload: {
      fieldId: { type: Number },
      tagName: { type: String },
      before: { type: String, default: null },
      after: { type: String, default: null }
    },

    context: {
      previousClassName: { type: String },
      newClassName: { type: String },
      refundedAt: { type: Date },
      note: { type: String }
    },

    planBatchId: { type: String, required: true, index: true },
    sourceRef: { type: String, index: true },

    plannedAt: { type: Date, required: true, default: Date.now },
    approvedAt: { type: Date },
    approvedBy: { type: String },
    appliedAt: { type: Date },
    revertedAt: { type: Date },
    blockedReason: { type: String },
    error: { type: String },
    attempts: { type: Number, default: 0 }
  },
  {
    timestamps: true,
    collection: 'renewalacchanges'
  }
)

renewalAcChangeSchema.index({ status: 1, plannedAt: -1 })
renewalAcChangeSchema.index({ email: 1, action: 1, status: 1 })
// dedupe: a mesma origem não gera a mesma acção duas vezes enquanto viva
renewalAcChangeSchema.index({ sourceRef: 1, action: 1 })

// Cast explícito: o padrão `models.X || model(...)` produz um union type
// que o TS não considera "callable" (problema sistémico do projecto).
const RenewalAcChange = (mongoose.models.RenewalAcChange ||
  mongoose.model<IRenewalAcChange>('RenewalAcChange', renewalAcChangeSchema)) as mongoose.Model<IRenewalAcChange>

export default RenewalAcChange
