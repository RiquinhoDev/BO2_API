// ════════════════════════════════════════════════════════════
// 📁 src/models/ACRenewalData.ts
// Dados de renovação vindos da ActiveCampaign (Data da compra, Data
// da 1ª compra, Data de expiração) por aluno OGI ativo — só leitura,
// nunca escreve na AC. Cruza com HotmartSaleHistory na tab Renovações
// pra comparar o que a Hotmart diz vs o que está na AC.
// ════════════════════════════════════════════════════════════

import mongoose, { Document, Schema } from 'mongoose'

export interface IACRenewalData extends Document {
  userId: mongoose.Types.ObjectId
  email: string
  contactId: string | null

  purchaseDate: Date | null // [Hotmart] Data da compra (AC field 334)
  firstPurchaseDate: Date | null // [Hotmart] Data da 1ª Compra (AC field 337)
  expirationDate: Date | null // [Hotmart] Data de expiração (AC field 332)

  lastSyncedAt: Date
  syncError: string | null

  createdAt: Date
  updatedAt: Date
}

const acRenewalDataSchema = new Schema<IACRenewalData>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    contactId: { type: String, default: null },

    purchaseDate: { type: Date, default: null },
    firstPurchaseDate: { type: Date, default: null },
    expirationDate: { type: Date, default: null },

    lastSyncedAt: { type: Date, required: true, default: Date.now, index: true },
    syncError: { type: String, default: null }
  },
  {
    timestamps: true,
    collection: 'acrenewaldata'
  }
)

acRenewalDataSchema.index({ userId: 1 }, { unique: true })

const ACRenewalData = (mongoose.models.ACRenewalData ||
  mongoose.model<IACRenewalData>('ACRenewalData', acRenewalDataSchema)) as mongoose.Model<IACRenewalData>

export default ACRenewalData
