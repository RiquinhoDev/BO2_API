// ════════════════════════════════════════════════════════════
// 📁 src/models/discordRenewal.ts
// Modelos do sistema de cargos de renovação no Discord (R. {Mês})
// e das mensagens do bot. Ver RENOVACAO_DISCORD_CARGOS_PLAN.md.
//
// Mesmo padrão do RenewalAcChange (sync AC): plano persistido e
// revisável ANTES de qualquer execução; execução gated por switches.
// ════════════════════════════════════════════════════════════

import mongoose, { Document, Schema } from 'mongoose'

// ─────────────────────────────────────────────────────────────
// 1. DiscordRoleChange — 1 doc = 1 operação de cargo planeada
// ─────────────────────────────────────────────────────────────

export type DiscordRoleAction = 'SET_ROLE' // aplica o cargo alvo e remove os outros R.* num só passo
export type DiscordRoleStatus =
  | 'PLANNED'
  | 'APPROVED'
  | 'APPLIED'
  | 'FAILED'
  | 'REVERTED'
  | 'EXPIRED'
  | 'BLOCKED'

export interface IDiscordRoleChange extends Document {
  email: string
  userId?: mongoose.Types.ObjectId
  discordUserId: string

  action: DiscordRoleAction
  status: DiscordRoleStatus

  payload: {
    addRoleId: string | null // cargo R.* alvo (null = só remover)
    addRoleName?: string | null
    removeRoleIds: string[] // cargos R.* a retirar (estado anterior registado)
    removeRoleNames?: string[]
  }

  context: {
    className?: string
    accessEndMonth?: number // 1-12
    note?: string
  }

  planBatchId: string
  sourceRef: string // `${discordUserId}` — 1 change viva por conta Discord

  plannedAt: Date
  approvedAt?: Date
  approvedBy?: string
  appliedAt?: Date
  notInGuild?: boolean
  blockedReason?: string
  error?: string
  attempts: number

  createdAt: Date
  updatedAt: Date
}

const discordRoleChangeSchema = new Schema<IDiscordRoleChange>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    discordUserId: { type: String, required: true, index: true },

    action: { type: String, enum: ['SET_ROLE'], default: 'SET_ROLE' },
    status: {
      type: String,
      enum: ['PLANNED', 'APPROVED', 'APPLIED', 'FAILED', 'REVERTED', 'EXPIRED', 'BLOCKED'],
      default: 'PLANNED',
      index: true
    },

    payload: {
      addRoleId: { type: String, default: null },
      addRoleName: { type: String, default: null },
      removeRoleIds: [{ type: String }],
      removeRoleNames: [{ type: String }]
    },

    context: {
      className: { type: String },
      accessEndMonth: { type: Number },
      note: { type: String }
    },

    planBatchId: { type: String, required: true, index: true },
    sourceRef: { type: String, required: true, index: true },

    plannedAt: { type: Date, required: true, default: Date.now },
    approvedAt: { type: Date },
    approvedBy: { type: String },
    appliedAt: { type: Date },
    notInGuild: { type: Boolean },
    blockedReason: { type: String },
    error: { type: String },
    attempts: { type: Number, default: 0 }
  },
  { timestamps: true, collection: 'discordrolechanges' }
)

discordRoleChangeSchema.index({ status: 1, plannedAt: -1 })

// ─────────────────────────────────────────────────────────────
// 2. DiscordRoleState — estado APLICADO por conta Discord
// (fonte da reconciliação; 1 cargo de renovação por conta — D3)
// ─────────────────────────────────────────────────────────────

export interface IDiscordRoleState extends Document {
  discordUserId: string
  userId?: mongoose.Types.ObjectId
  email: string
  roleId: string
  roleName: string
  appliedAt: Date
  lastChangeId?: string
}

const discordRoleStateSchema = new Schema<IDiscordRoleState>(
  {
    discordUserId: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    email: { type: String, lowercase: true, trim: true, index: true },
    roleId: { type: String, required: true },
    roleName: { type: String, required: true },
    appliedAt: { type: Date, required: true },
    lastChangeId: { type: String }
  },
  { timestamps: true, collection: 'discordrolestates' }
)

// ─────────────────────────────────────────────────────────────
// 3. DiscordMessageTemplate — textos editáveis na UI
// ─────────────────────────────────────────────────────────────

export interface IDiscordMessageTemplate extends Document {
  key: string // 'aviso-importante' | 'ultimo-dia' | outros futuros
  name: string
  content: string // com placeholders {cargos} e {dataFim}
  updatedBy?: string
  createdAt: Date
  updatedAt: Date
}

const discordMessageTemplateSchema = new Schema<IDiscordMessageTemplate>(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    content: { type: String, required: true },
    updatedBy: { type: String }
  },
  { timestamps: true, collection: 'discordmessagetemplates' }
)

// ─────────────────────────────────────────────────────────────
// 4. DiscordMessageLog — registo de cada envio (auditável)
// ─────────────────────────────────────────────────────────────

export interface IDiscordMessageLog extends Document {
  channelId: string
  content: string
  mentionRoleIds: string[]
  mentionRoleNames: string[]
  templateKey?: string
  sentBy: string
  messageIds: string[]
  parts: number
  sentAt: Date
}

const discordMessageLogSchema = new Schema<IDiscordMessageLog>(
  {
    channelId: { type: String, required: true },
    content: { type: String, required: true },
    mentionRoleIds: [{ type: String }],
    mentionRoleNames: [{ type: String }],
    templateKey: { type: String },
    sentBy: { type: String, required: true },
    messageIds: [{ type: String }],
    parts: { type: Number, default: 1 },
    sentAt: { type: Date, required: true, default: Date.now }
  },
  { timestamps: true, collection: 'discordmessagelogs' }
)

// Casts explícitos (padrão do projecto — evita o union type não-callable)
export const DiscordRoleChange = (mongoose.models.DiscordRoleChange ||
  mongoose.model<IDiscordRoleChange>('DiscordRoleChange', discordRoleChangeSchema)) as mongoose.Model<IDiscordRoleChange>

export const DiscordRoleState = (mongoose.models.DiscordRoleState ||
  mongoose.model<IDiscordRoleState>('DiscordRoleState', discordRoleStateSchema)) as mongoose.Model<IDiscordRoleState>

export const DiscordMessageTemplate = (mongoose.models.DiscordMessageTemplate ||
  mongoose.model<IDiscordMessageTemplate>('DiscordMessageTemplate', discordMessageTemplateSchema)) as mongoose.Model<IDiscordMessageTemplate>

export const DiscordMessageLog = (mongoose.models.DiscordMessageLog ||
  mongoose.model<IDiscordMessageLog>('DiscordMessageLog', discordMessageLogSchema)) as mongoose.Model<IDiscordMessageLog>
