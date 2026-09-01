import mongoose, { Schema } from 'mongoose'

export interface IClarezaCarteiraMetrics {
  price: number | null
  change: number | null
  perf12m: number | null
  chgDay?: number | null
  chgWeek?: number | null
  chgMonth?: number | null
  marketCap?: number | null
  beta?: number | null
  range?: string | null
  country?: string | null
  industry?: string | null
  pe?: number | null
  peg?: number | null
  ps?: number | null
  pb?: number | null
  evEbitda?: number | null
  fcfYield?: number | null
  roe?: number | null
  netMargin?: number | null
  grossMarginTTM?: number | null
  dividendYield: number | null
  payoutRatio?: number | null
  debtEquity?: number | null
  debtEbitda?: number | null
  revenueGrowth?: number | null
  perf3m?: number | null
  roic?: number | null
  interestCoverage?: number | null
  fcfConversion?: number | null
  growthYears?: number | null
  latestFiscalYear?: string | null
  revenueYoY?: number | null
  epsYoY?: number | null
  epsTurnaround?: boolean
  histMedians?: Readonly<Record<string, number | null>>
  epsCagr?: number | null
  revenueCagr?: number | null
  dcf?: number | null
  marginStability?: number | null
  pFfo?: number | null
  ffoYield?: number | null
  ffoPayoutRatio?: number | null
  currency: string | null
  exchange: string | null
  updated: string
}

export interface IClarezaCarteiraItem {
  ticker: string
  name: string
  type: string
  kind: 'stock' | 'fund' | 'crypto'
  sector: string
  data: IClarezaCarteiraMetrics | null
}

export interface IClarezaCarteiraData {
  fetchedAt: Date
  itemCount: number
  errors: number
  items: IClarezaCarteiraItem[]
}

const ClarezaCarteiraDataSchema = new Schema<IClarezaCarteiraData>(
  {
    fetchedAt: { type: Date, default: Date.now, index: true },
    itemCount: { type: Number, required: true },
    errors: { type: Number, default: 0 },
    items: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: false, suppressReservedKeysWarning: true }
)

export default mongoose.model<IClarezaCarteiraData>('ClarezaCarteiraData', ClarezaCarteiraDataSchema)
