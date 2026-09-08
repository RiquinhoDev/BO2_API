// ════════════════════════════════════════════════════════════
// 📁 src/models/HotmartSaleHistory.ts
// Histórico de compras Hotmart por aluno ativo (Sync Hotmart, Fase 1).
//
// Um documento por (userId, hotmartProductId) — a chave continua a ser o
// produto OGI principal — com todas as vendas da família OGI encontradas
// na Hotmart para o email desse aluno (ver OGI_PRODUCT_FAMILY_IDS) —
// usado para melhorar a precisão de renovações e dos links enviados.
// Escreve APENAS na nossa BD — nunca toca em nada externo.
// ════════════════════════════════════════════════════════════

import mongoose, { Document, Schema } from 'mongoose'

export interface IHotmartSale {
  // A que produto da família OGI pertence esta venda. Sem isto não se
  // distinguia o OGI da Renovação de 97€ na ficha do aluno, e é essa
  // distinção que mostra a compra dupla que dá os 2 anos de acesso.
  hotmartProductId: string | null
  productName: string | null
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
    hotmartProductId: { type: String, default: null },
    productName: { type: String, default: null },
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
