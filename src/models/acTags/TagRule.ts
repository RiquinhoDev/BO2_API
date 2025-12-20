// ════════════════════════════════════════════════════════════
// 📁 src/models/TagRule.ts
// Modelo de TagRule - Regras configuráveis de tags
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export type RuleCategory = 'INACTIVITY' | 'ENGAGEMENT' | 'PROGRESS' | 'COMPLETION'
export type ConditionType = 'SIMPLE' | 'COMPOUND'
export type OperatorType = 'olderThan' | 'newerThan' | 'equals' | 'greaterThan' | 'lessThan'
export type UnitType = 'days' | 'weeks' | 'reports' | 'percentage'
export type LogicType = 'AND' | 'OR'

export interface ISubCondition {
  field: string
  operator: OperatorType
  value: number
  unit: UnitType
}

export interface ICondition {
  type: ConditionType
  field?: string
  operator?: OperatorType
  value?: number
  unit?: UnitType
  logic?: LogicType
  subConditions?: ISubCondition[]
}

export interface ITagActions {
  addTag: string
  removeTags: string[]
  acAutomationId?: string
}

export interface ITagRule extends Document {
  courseId: mongoose.Types.ObjectId
  name: string
  description: string
  category: RuleCategory
  priority: number
  conditions: ICondition[]
  actions: ITagActions
  emailPreview?: string
  isActive: boolean
  lastRunAt?: Date
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

// ─────────────────────────────────────────────────────────────
// SCHEMAS
// ─────────────────────────────────────────────────────────────

const SubConditionSchema = new Schema<ISubCondition>({
  field: { type: String, required: true },
  operator: {
    type: String,
    enum: ['olderThan', 'newerThan', 'equals', 'greaterThan', 'lessThan'],
    required: true
  },
  value: { type: Number, required: true },
  unit: {
    type: String,
    enum: ['days', 'weeks', 'reports', 'percentage'],
    required: true
  }
}, { _id: false })

const ConditionSchema = new Schema<ICondition>({
  type: {
    type: String,
    enum: ['SIMPLE', 'COMPOUND'],
    required: true
  },
  field: { type: String },
  operator: {
    type: String,
    enum: ['olderThan', 'newerThan', 'equals', 'greaterThan', 'lessThan']
  },
  value: { type: Number },
  unit: {
    type: String,
    enum: ['days', 'weeks', 'reports', 'percentage']
  },
  logic: {
    type: String,
    enum: ['AND', 'OR']
  },
  subConditions: [SubConditionSchema]
}, { _id: false })

const TagActionsSchema = new Schema<ITagActions>({
  addTag: { type: String, required: true },
  removeTags: [{ type: String }],
  acAutomationId: { type: String }
}, { _id: false })

const TagRuleSchema = new Schema<ITagRule>({
  courseId: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['INACTIVITY', 'ENGAGEMENT', 'PROGRESS', 'COMPLETION'],
    required: true,
    index: true
  },
  priority: {
    type: Number,
    required: true,
    default: 5,
    min: 1,
    max: 10
  },
  conditions: [ConditionSchema],
  actions: {
    type: TagActionsSchema,
    required: true
  },
  emailPreview: { type: String },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastRunAt: { type: Date },
  createdBy: {
    type: String,
    required: true
  }
}, {
  timestamps: true,
  collection: 'tagrules'
})

// ─────────────────────────────────────────────────────────────
// ÍNDICES
// ─────────────────────────────────────────────────────────────

TagRuleSchema.index({ courseId: 1, isActive: 1 })
TagRuleSchema.index({ category: 1, priority: -1 })
TagRuleSchema.index({ courseId: 1, category: 1, isActive: 1 })

// ─────────────────────────────────────────────────────────────
// MÉTODOS ESTÁTICOS
// ─────────────────────────────────────────────────────────────

TagRuleSchema.statics.getActiveRulesByCourse = async function(
  courseId: mongoose.Types.ObjectId
) {
  return this.find({
    courseId,
    isActive: true
  }).sort({ priority: -1 })
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

const TagRule = mongoose.models.TagRule || mongoose.model<ITagRule>('TagRule', TagRuleSchema)

export default TagRule

