// ════════════════════════════════════════════════════════════
// 📁 src/models/ProductSalesStats.ts
// MODEL: Estatísticas Agregadas de Vendas por Produto
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export type DateSourceType = 
  | 'purchaseDate'        // Data real de compra (Hotmart)
  | 'joinedDate'          // Data de entrada (CursEduca)
  | 'enrolledAt'          // Data de enrollment (UserProduct)
  | 'joinedServer'        // Data de entrada no servidor (Discord)
  | 'firstSystemEntry'    // 🆕 Primeira entrada no sistema
  | 'createdAt'           // Data de criação (fallback)

export interface IDateSourceBreakdown {
  purchaseDate: number        // Quantos usaram purchaseDate
  joinedDate: number          // Quantos usaram joinedDate
  enrolledAt: number          // Quantos usaram enrolledAt
  joinedServer: number        // Quantos usaram joinedServer
  firstSystemEntry: number    // 🆕 Quantos usaram firstSystemEntry
  createdAt: number           // Quantos usaram createdAt
  unknown: number             // Quantos não tinham data válida
}

export interface IMonthlySales {
  year: number
  month: number              // 1-12
  count: number              // Total de vendas/adesões
  newStudents: number        // Novos estudantes (primeiro produto)
  existingStudents: number   // Estudantes que já tinham outro produto
  
  // 🆕 Origem dos dados de data
  dataSources: IDateSourceBreakdown
  
  // Datas do período
  oldestSale: Date
  newestSale: Date
}

export interface IYearlySales {
  year: number
  count: number
  newStudents: number
  existingStudents: number
  dataSources: IDateSourceBreakdown
  monthlyBreakdown: number[] // Array de 12 posições (jan-dez)
}

export interface IProductSalesStats extends Document {
  _id: mongoose.Types.ObjectId
  
  // Referência ao produto
  productId: mongoose.Types.ObjectId
  productCode: string
  productName: string
  platform: 'hotmart' | 'curseduca' | 'discord' | 'mixed'
  
  // Dados agregados mensais
  salesByMonth: IMonthlySales[]
  
  // Dados agregados anuais
  salesByYear: IYearlySales[]
  
  // Totais gerais
  totals: {
    allTime: number
    lastYear: number
    last6Months: number
    last3Months: number
    lastMonth: number
    currentMonth: number
  }
  
  // Distribuição de fontes de dados
  overallDataSources: IDateSourceBreakdown
  
  // Metadata
  meta: {
    calculatedAt: Date
    oldestSale: Date
    newestSale: Date
    totalRecordsProcessed: number
    recordsWithValidDates: number
    recordsWithoutDates: number
  }
}

// ─────────────────────────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────────────────────────

const DateSourceBreakdownSchema = new Schema({
  purchaseDate: { type: Number, default: 0 },
  joinedDate: { type: Number, default: 0 },
  enrolledAt: { type: Number, default: 0 },
  joinedServer: { type: Number, default: 0 },
  firstSystemEntry: { type: Number, default: 0 },
  createdAt: { type: Number, default: 0 },
  unknown: { type: Number, default: 0 }
}, { _id: false })

const MonthlySalesSchema = new Schema({
  year: { type: Number, required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  count: { type: Number, default: 0 },
  newStudents: { type: Number, default: 0 },
  existingStudents: { type: Number, default: 0 },
  dataSources: { type: DateSourceBreakdownSchema, required: true },
  oldestSale: Date,
  newestSale: Date
}, { _id: false })

const YearlySalesSchema = new Schema({
  year: { type: Number, required: true },
  count: { type: Number, default: 0 },
  newStudents: { type: Number, default: 0 },
  existingStudents: { type: Number, default: 0 },
  dataSources: { type: DateSourceBreakdownSchema, required: true },
  monthlyBreakdown: [{ type: Number }]  // 12 posições
}, { _id: false })

const ProductSalesStatsSchema = new Schema<IProductSalesStats>({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  productCode: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  productName: {
    type: String,
    required: true
  },
  platform: {
    type: String,
    enum: ['hotmart', 'curseduca', 'discord', 'mixed'],
    required: true
  },
  
  salesByMonth: [MonthlySalesSchema],
  salesByYear: [YearlySalesSchema],
  
  totals: {
    allTime: { type: Number, default: 0 },
    lastYear: { type: Number, default: 0 },
    last6Months: { type: Number, default: 0 },
    last3Months: { type: Number, default: 0 },
    lastMonth: { type: Number, default: 0 },
    currentMonth: { type: Number, default: 0 }
  },
  
  overallDataSources: {
    type: DateSourceBreakdownSchema,
    required: true
  },
  
  meta: {
    calculatedAt: { type: Date, required: true },
    oldestSale: Date,
    newestSale: Date,
    totalRecordsProcessed: { type: Number, default: 0 },
    recordsWithValidDates: { type: Number, default: 0 },
    recordsWithoutDates: { type: Number, default: 0 }
  }
}, {
  timestamps: true,
  collection: 'productsalesstats'
})

// ─────────────────────────────────────────────────────────────
// ÍNDICES
// ─────────────────────────────────────────────────────────────

// Buscar por produto
ProductSalesStatsSchema.index({ productId: 1 })
ProductSalesStatsSchema.index({ productCode: 1 })

// Buscar por plataforma
ProductSalesStatsSchema.index({ platform: 1 })

// Ordenar por data de cálculo
ProductSalesStatsSchema.index({ 'meta.calculatedAt': -1 })

// ⚡ ÍNDICE ÚNICO: Um stats por produto
ProductSalesStatsSchema.index({ productId: 1 }, { unique: true })

// ─────────────────────────────────────────────────────────────
// MÉTODOS
// ─────────────────────────────────────────────────────────────

ProductSalesStatsSchema.methods.getSalesByPeriod = function(
  startDate: Date,
  endDate: Date
): IMonthlySales[] {
  return this.salesByMonth.filter((sale: IMonthlySales) => {
    const saleDate = new Date(sale.year, sale.month - 1, 1)
    return saleDate >= startDate && saleDate <= endDate
  })
}

ProductSalesStatsSchema.methods.getYearData = function(year: number): IYearlySales | undefined {
  return this.salesByYear.find((y: IYearlySales) => y.year === year)
}

ProductSalesStatsSchema.methods.getGrowthRate = function(months: number = 6): number {
  if (this.salesByMonth.length < 2) return 0
  
  const recentMonths = this.salesByMonth.slice(-months)
  if (recentMonths.length < 2) return 0
  
  const firstMonth = recentMonths[0].count
  const lastMonth = recentMonths[recentMonths.length - 1].count
  
  if (firstMonth === 0) return 0
  
  return Math.round(((lastMonth - firstMonth) / firstMonth) * 100)
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

const ProductSalesStats: mongoose.Model<IProductSalesStats> = mongoose.models.ProductSalesStats ||
  mongoose.model<IProductSalesStats>('ProductSalesStats', ProductSalesStatsSchema)

export default ProductSalesStats