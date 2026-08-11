// ════════════════════════════════════════════════════════════
// 📁 src/models/HotmartSalesMonthlyStats.ts
// Desempenho de vendas Hotmart (OGI) por mês — nº de vendas + capital,
// materializado a partir do mesmo pedido em bulk já feito pelo Sync
// Hotmart (hotmartSalesHistory.service.ts), sem chamadas extra à API.
//
// Ao contrário de HotmartSaleHistory (só alunos ATIVOS), aqui entram
// TODAS as vendas do produto OGI vistas nesse pedido — incluindo quem
// entretanto saiu/reembolsou — porque o objetivo é desempenho de
// vendas, não matching de renovação.
// ════════════════════════════════════════════════════════════

import mongoose, { Document, Schema } from 'mongoose'

export interface IHotmartSalesMonthlyStats extends Document {
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

const hotmartSalesMonthlyStatsSchema = new Schema<IHotmartSalesMonthlyStats>(
  {
    month: { type: String, required: true, unique: true },
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
    collection: 'hotmartsalesmonthlystats'
  }
)

const HotmartSalesMonthlyStats = (mongoose.models.HotmartSalesMonthlyStats ||
  mongoose.model<IHotmartSalesMonthlyStats>('HotmartSalesMonthlyStats', hotmartSalesMonthlyStatsSchema)) as mongoose.Model<IHotmartSalesMonthlyStats>

export default HotmartSalesMonthlyStats
