// ════════════════════════════════════════════════════════════
// 📁 src/models/ProductSalesMonthlyStats.ts
// Desempenho de vendas por produto e por mês — nº de vendas + capital,
// um documento por (productKey, month). Multi-plataforma: OGI vem da
// Hotmart, Clareza (Mensal/Anual) vem da Guru — ver
// src/services/products/productSalesPerformance.service.ts.
// ════════════════════════════════════════════════════════════

import mongoose, { Document, Schema } from 'mongoose'

export interface IProductSalesMonthlyStats extends Document {
  productKey: string // 'OGI' | 'CLAREZA_MENSAL' | 'CLAREZA_ANUAL'
  month: string // 'YYYY-MM'
  year: number
  monthNum: number // 1-12

  salesCount: number
  revenueByCurrency: Record<string, number>

  refundedCount: number
  refundedByCurrency: Record<string, number>

  lastSyncedAt: Date

  createdAt: Date
  updatedAt: Date
}

const productSalesMonthlyStatsSchema = new Schema<IProductSalesMonthlyStats>(
  {
    productKey: { type: String, required: true, index: true },
    month: { type: String, required: true },
    year: { type: Number, required: true, index: true },
    monthNum: { type: Number, required: true },

    salesCount: { type: Number, default: 0 },
    revenueByCurrency: { type: Schema.Types.Mixed, default: {} },

    refundedCount: { type: Number, default: 0 },
    refundedByCurrency: { type: Schema.Types.Mixed, default: {} },

    lastSyncedAt: { type: Date, required: true, default: Date.now }
  },
  {
    timestamps: true,
    collection: 'productsalesmonthlystats'
  }
)

productSalesMonthlyStatsSchema.index({ productKey: 1, month: 1 }, { unique: true })

const ProductSalesMonthlyStats = (mongoose.models.ProductSalesMonthlyStats ||
  mongoose.model<IProductSalesMonthlyStats>('ProductSalesMonthlyStats', productSalesMonthlyStatsSchema)) as mongoose.Model<IProductSalesMonthlyStats>

export default ProductSalesMonthlyStats
