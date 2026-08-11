// ════════════════════════════════════════════════════════════
// 📁 src/models/HotmartSaleHistory.ts
// Histórico de compras Hotmart por aluno ativo (Sync Hotmart, Fase 1).
//
// Um documento por (userId, hotmartProductId) com todas as vendas
// encontradas na Hotmart para o email desse aluno nesse produto —
// usado para melhorar a precisão de renovações e dos links enviados.
// Escreve APENAS na nossa BD — nunca toca em nada externo.
// ════════════════════════════════════════════════════════════

import mongoose, { Document, Schema } from 'mongoose'

export interface IHotmartSale {
  transaction: string | null
  offerCode: string | null
  offerName: string | null
  transactionStatus: string | null
  approvedDate: Date | null
  orderDate: Date | null
  priceValue: number | null
  currency: string | null
  paymentMode: string | null
}

export interface IHotmartSaleHistory extends Document {
  userId: mongoose.Types.ObjectId
  email: string
  productId: mongoose.Types.ObjectId
  hotmartProductId: string

  sales: IHotmartSale[]
  salesCount: number

  // desnormalizado da venda mais recente, para listar/ordenar sem percorrer sales[]
  latestApprovedDate: Date | null
  latestOfferCode: string | null
  latestTransactionStatus: string | null

  lastSyncedAt: Date
  syncError: string | null

  createdAt: Date
  updatedAt: Date
}

const hotmartSaleSchema = new Schema<IHotmartSale>(
  {
    transaction: { type: String, default: null },
    offerCode: { type: String, default: null },
    offerName: { type: String, default: null },
    transactionStatus: { type: String, default: null },
    approvedDate: { type: Date, default: null },
    orderDate: { type: Date, default: null },
    priceValue: { type: Number, default: null },
    currency: { type: String, default: null },
    paymentMode: { type: String, default: null }
  },
  { _id: false }
)

const hotmartSaleHistorySchema = new Schema<IHotmartSaleHistory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    hotmartProductId: { type: String, required: true, index: true },

    sales: { type: [hotmartSaleSchema], default: [] },
    salesCount: { type: Number, default: 0 },

    latestApprovedDate: { type: Date, default: null, index: true },
    latestOfferCode: { type: String, default: null },
    latestTransactionStatus: { type: String, default: null },

    lastSyncedAt: { type: Date, required: true, default: Date.now, index: true },
    syncError: { type: String, default: null }
  },
  {
    timestamps: true,
    collection: 'hotmartsalehistories'
  }
)

hotmartSaleHistorySchema.index({ userId: 1, hotmartProductId: 1 }, { unique: true })

const HotmartSaleHistory = (mongoose.models.HotmartSaleHistory ||
  mongoose.model<IHotmartSaleHistory>('HotmartSaleHistory', hotmartSaleHistorySchema)) as mongoose.Model<IHotmartSaleHistory>

export default HotmartSaleHistory
