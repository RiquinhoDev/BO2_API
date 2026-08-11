import mongoose, { Schema } from 'mongoose'
import type { ComparadorStock } from '../services/clareza/comparador/comparador.types'

export interface IClarezaComparadorData {
  fetchedAt: Date
  updated: string | null
  stockCount: number
  errors: number
  stocks: Record<string, ComparadorStock>
}

const nullableNumber = { type: Number, default: null }
const nullableString = { type: String, default: null }

const ComparadorStockSchema = new Schema<ComparadorStock>(
  {
    ticker: { type: String, required: true },
    name: { type: String, required: true },
    image: nullableString,
    sector: nullableString,
    industry: nullableString,
    country: nullableString,
    currency: { type: String, required: true },
    exchange: nullableString,
    isReit: { type: Boolean, required: true },
    price: nullableNumber,
    change: nullableNumber,
    perf12m: nullableNumber,
    marketCap: nullableNumber,
    beta: nullableNumber,
    pe: nullableNumber,
    peg: nullableNumber,
    ps: nullableNumber,
    pb: nullableNumber,
    evEbitda: nullableNumber,
    pFfo: nullableNumber,
    grossMargin: nullableNumber,
    netMargin: nullableNumber,
    roe: nullableNumber,
    roic: nullableNumber,
    fcfYield: nullableNumber,
    debtEquity: nullableNumber,
    debtEbitda: nullableNumber,
    dividendYield: nullableNumber,
    payoutRatio: nullableNumber,
    ffoPayout: nullableNumber,
    analystConsensus: nullableString,
    strongBuy: nullableNumber,
    buy: nullableNumber,
    hold: nullableNumber,
    sell: nullableNumber,
    strongSell: nullableNumber,
    targetConsensus: nullableNumber,
    upside: nullableNumber,
    updated: { type: String, required: true },
  },
  { _id: false, strict: 'throw' },
)

const ClarezaComparadorDataSchema = new Schema<IClarezaComparadorData>(
  {
    fetchedAt: { type: Date, required: true, index: true },
    updated: nullableString,
    stockCount: { type: Number, required: true },
    errors: { type: Number, required: true },
    stocks: { type: Map, of: ComparadorStockSchema, required: true },
  },
  { timestamps: false, strict: 'throw', suppressReservedKeysWarning: true },
)

export default mongoose.model<IClarezaComparadorData>('ClarezaComparadorData', ClarezaComparadorDataSchema)
