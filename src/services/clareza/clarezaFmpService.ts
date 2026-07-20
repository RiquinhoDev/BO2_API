import axios from 'axios'
import { cacheService } from '../cache.service'
import { fmpThrottle } from './fmpThrottle'
import { normalizeTicker, isValidTicker } from './tickerUtils'
import ClarezaMarketData from '../../models/ClarezaMarketData'

type FmpNumericField =
  | 'price'
  | 'changePercentage'
  | 'marketCap'
  | 'beta'
  | 'sharesOutstanding'
  | 'sharesOut'
  | 'netIncome'
  | 'depreciationAndAmortization'
  | 'weightedAverageShsOut'
  | 'weightedAverageShsOutDil'
  | 'netDividendsPaid'
  | 'dividendsPaid'
  | 'capitalExpenditure'
  | 'adjDividend'
  | 'dividend'
  | 'stockPrice'
  | 'revenue'
  | 'ebitda'
  | 'grossProfit'
  | 'operatingIncome'
  | 'eps'
  | 'epsdiluted'
  | 'totalStockholdersEquity'
  | 'cashAndShortTermInvestments'
  | 'totalDebt'
  | 'totalDebtAndCapitalLeaseObligations'
  | 'shortTermDebt'
  | 'longTermDebt'
  | 'netDebt'
  | 'totalCurrentAssets'
  | 'totalCurrentLiabilities'
  | 'lastDividend'
  | 'lastDiv'
  | 'lastMonthAvgPriceTarget'
  | 'allTimeAvgPriceTarget'
  | 'targetConsensus'
  | 'priceTarget'
  | 'priceToEarningsRatioTTM'
  | 'forwardPriceToEarningsGrowthRatioTTM'
  | 'priceToEarningsGrowthRatioTTM'
  | 'priceToSalesRatioTTM'
  | 'priceToBookRatioTTM'
  | 'debtToEquityRatioTTM'
  | 'netProfitMarginTTM'
  | 'grossProfitMarginTTM'
  | 'dividendYieldTTM'
  | 'dividendPayoutRatioTTM'
  | 'interestCoverageRatioTTM'
  | 'interestCoverageTTM'
  | 'currentRatioTTM'
  | 'cashRatioTTM'
  | 'evToEBITDATTM'
  | 'freeCashFlowYieldTTM'
  | 'returnOnEquityTTM'
  | 'netDebtToEBITDATTM'

type FmpRecord = Partial<Record<FmpNumericField, number | null>> & {
  [key: string]: unknown
  symbol?: string
  companyName?: string
  sector?: string
  industry?: string
  currency?: string
  exchangeShortName?: string
  exchange?: string
  range?: string
  calendarYear?: string | number
  year?: string | number
  date?: string
  peersList?: string[]
}

interface ClarezaStockData extends FmpRecord {
  change?: number | null
  pe?: number | null
  peg?: number | null
  pb?: number | null
  evEbitda?: number | null
  grossMarginTTM?: number | null
  netMargin?: number | null
  roe?: number | null
  debtEbitda?: number | null
  pFfo?: number | null
  ffoYield?: number | null
  ffoPayoutRatio?: number | null
  payoutRatio?: number | null
  updated?: string
}

interface ClarezaStockEntry {
  ticker: string
  name: string
  type: string
  sector: string
  data: ClarezaStockData | null
}

function isRecord(value: unknown): value is FmpRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstRecord(value: unknown): FmpRecord | null {
  if (Array.isArray(value)) return value.find(isRecord) ?? null
  return isRecord(value) ? value : null
}

function recordArray(value: unknown): FmpRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord)
  return isRecord(value) ? [value] : []
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function fmpErrorDetails(error: unknown): { status?: number; body: string; message: string } {
  if (!axios.isAxiosError(error)) {
    return { body: '', message: errorMessage(error) }
  }

  const responseData: unknown = error.response?.data
  const body = typeof responseData === 'string'
    ? responseData.slice(0, 120)
    : JSON.stringify(responseData ?? '').slice(0, 120)
  return { status: error.response?.status, body, message: error.message }
}

// Limita concorrência sem depender de p-queue (ESM-only)
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = []
  let index = 0
  async function worker() {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

const FMP_BASE = 'https://financialmodelingprep.com/stable'
export const CLAREZA_CACHE_KEY = 'clareza:stock-data'
const CACHE_TTL = 28800 // 8 horas

// ─────────────────────────────────────────────────────────────
// UNIVERSO DE AÇÕES
// ─────────────────────────────────────────────────────────────

export const UNIVERSE = [
  // GROWTH
  { ticker: 'NVDA',  name: 'Nvidia',                 type: 'growth', sector: 'Technology' },
  { ticker: 'AAPL',  name: 'Apple',                  type: 'growth', sector: 'Technology' },
  { ticker: 'GOOGL', name: 'Alphabet',               type: 'growth', sector: 'Technology' },
  { ticker: 'MSFT',  name: 'Microsoft',              type: 'growth', sector: 'Technology' },
  { ticker: 'AMZN',  name: 'Amazon',                 type: 'growth', sector: 'Technology' },
  { ticker: 'AVGO',  name: 'Broadcom',               type: 'growth', sector: 'Technology' },
  { ticker: 'META',  name: 'Meta',                   type: 'growth', sector: 'Technology' },
  { ticker: 'TSLA',  name: 'Tesla',                  type: 'growth', sector: 'Consumer' },
  { ticker: 'AMD',   name: 'AMD',                    type: 'growth', sector: 'Technology' },
  { ticker: 'NFLX',  name: 'Netflix',                type: 'growth', sector: 'Technology' },
  { ticker: 'PLTR',  name: 'Palantir',               type: 'growth', sector: 'Technology' },
  { ticker: 'CRM',   name: 'Salesforce',             type: 'growth', sector: 'Technology' },
  { ticker: 'ADBE',  name: 'Adobe',                  type: 'growth', sector: 'Technology' },
  { ticker: 'ORCL',  name: 'Oracle',                 type: 'growth', sector: 'Technology' },
  { ticker: 'LRCX',  name: 'Lam Research',           type: 'growth', sector: 'Technology' },
  { ticker: 'AMAT',  name: 'Applied Materials',      type: 'growth', sector: 'Technology' },
  { ticker: 'KLAC',  name: 'KLA Corporation',        type: 'growth', sector: 'Technology' },
  { ticker: 'ANET',  name: 'Arista Networks',        type: 'growth', sector: 'Technology' },
  { ticker: 'ISRG',  name: 'Intuitive Surgical',     type: 'growth', sector: 'Healthcare' },
  { ticker: 'NOW',   name: 'ServiceNow',             type: 'growth', sector: 'Technology' },
  { ticker: 'PANW',  name: 'Palo Alto Networks',     type: 'growth', sector: 'Technology' },
  { ticker: 'MRVL',  name: 'Marvell Technology',     type: 'growth', sector: 'Technology' },
  { ticker: 'MU',    name: 'Micron Technology',      type: 'growth', sector: 'Technology' },
  { ticker: 'UBER',  name: 'Uber',                   type: 'growth', sector: 'Technology' },
  { ticker: 'LLY',   name: 'Eli Lilly',              type: 'growth', sector: 'Healthcare' },
  { ticker: 'COST',  name: 'Costco',                 type: 'growth', sector: 'Consumer' },
  { ticker: 'TMUS',  name: 'T-Mobile',               type: 'growth', sector: 'Telecom' },
  { ticker: 'GEV',   name: 'GE Vernova',             type: 'growth', sector: 'Industrials' },
  { ticker: 'GE',    name: 'GE Aerospace',           type: 'growth', sector: 'Industrials' },
  { ticker: 'APP',   name: 'AppLovin',               type: 'growth', sector: 'Technology' },
  { ticker: 'CRWD',  name: 'CrowdStrike',            type: 'growth', sector: 'Technology' },
  { ticker: 'INTU',  name: 'Intuit',                 type: 'growth', sector: 'Technology' },
  { ticker: 'ADSK',  name: 'Autodesk',               type: 'growth', sector: 'Technology' },
  { ticker: 'WDAY',  name: 'Workday',                type: 'growth', sector: 'Technology' },
  { ticker: 'DDOG',  name: 'Datadog',                type: 'growth', sector: 'Technology' },
  { ticker: 'TTD',   name: 'The Trade Desk',         type: 'growth', sector: 'Technology' },
  { ticker: 'VRTX',  name: 'Vertex Pharmaceuticals', type: 'growth', sector: 'Healthcare' },
  { ticker: 'REGN',  name: 'Regeneron',              type: 'growth', sector: 'Healthcare' },
  { ticker: 'BSX',   name: 'Boston Scientific',      type: 'growth', sector: 'Healthcare' },
  { ticker: 'HCA',   name: 'HCA Healthcare',         type: 'growth', sector: 'Healthcare' },
  { ticker: 'SYK',   name: 'Stryker',                type: 'growth', sector: 'Healthcare' },
  { ticker: 'CEG',   name: 'Constellation Energy',   type: 'growth', sector: 'Utilities' },
  { ticker: 'DELL',  name: 'Dell Technologies',      type: 'growth', sector: 'Technology' },
  { ticker: 'APH',   name: 'Amphenol',               type: 'growth', sector: 'Technology' },
  { ticker: 'ADI',   name: 'Analog Devices',         type: 'growth', sector: 'Technology' },
  { ticker: 'QCOM',  name: 'Qualcomm',               type: 'growth', sector: 'Technology' },
  { ticker: 'SPGI',  name: 'S&P Global',             type: 'growth', sector: 'Finance' },
  { ticker: 'CME',   name: 'CME Group',              type: 'growth', sector: 'Finance' },
  { ticker: 'MCO',   name: "Moody's",                type: 'growth', sector: 'Finance' },
  { ticker: 'BLK',   name: 'BlackRock',              type: 'growth', sector: 'Finance' },
  { ticker: 'BKNG',  name: 'Booking Holdings',       type: 'growth', sector: 'Consumer' },
  { ticker: 'SBUX',  name: 'Starbucks',              type: 'growth', sector: 'Consumer' },
  { ticker: 'NKE',   name: 'Nike',                   type: 'growth', sector: 'Consumer' },
  { ticker: 'LULU',  name: 'Lululemon',              type: 'growth', sector: 'Consumer' },
  { ticker: 'ELV',   name: 'Elevance Health',        type: 'growth', sector: 'Healthcare' },
  { ticker: 'FICO',  name: 'Fair Isaac (FICO)',       type: 'growth', sector: 'Technology' },
  { ticker: 'HWM',   name: 'Howmet Aerospace',       type: 'growth', sector: 'Industrials' },
  // VALUE
  { ticker: 'BRK-B', name: 'Berkshire Hathaway',     type: 'value',  sector: 'Finance' },
  { ticker: 'JPM',   name: 'JPMorgan Chase',         type: 'value',  sector: 'Finance' },
  { ticker: 'BAC',   name: 'Bank of America',        type: 'value',  sector: 'Finance' },
  { ticker: 'WFC',   name: 'Wells Fargo',            type: 'value',  sector: 'Finance' },
  { ticker: 'GS',    name: 'Goldman Sachs',          type: 'value',  sector: 'Finance' },
  { ticker: 'MS',    name: 'Morgan Stanley',         type: 'value',  sector: 'Finance' },
  { ticker: 'C',     name: 'Citigroup',              type: 'value',  sector: 'Finance' },
  { ticker: 'AXP',   name: 'American Express',       type: 'value',  sector: 'Finance' },
  { ticker: 'SCHW',  name: 'Charles Schwab',         type: 'value',  sector: 'Finance' },
  { ticker: 'COF',   name: 'Capital One',            type: 'value',  sector: 'Finance' },
  { ticker: 'USB',   name: 'US Bancorp',             type: 'value',  sector: 'Finance' },
  { ticker: 'PNC',   name: 'PNC Financial',          type: 'value',  sector: 'Finance' },
  { ticker: 'CB',    name: 'Chubb',                  type: 'value',  sector: 'Finance' },
  { ticker: 'PGR',   name: 'Progressive',            type: 'value',  sector: 'Finance' },
  { ticker: 'MET',   name: 'MetLife',                type: 'value',  sector: 'Finance' },
  { ticker: 'AFL',   name: 'Aflac',                  type: 'value',  sector: 'Finance' },
  { ticker: 'V',     name: 'Visa',                   type: 'value',  sector: 'Finance' },
  { ticker: 'MA',    name: 'Mastercard',             type: 'value',  sector: 'Finance' },
  { ticker: 'XOM',   name: 'Exxon Mobil',            type: 'value',  sector: 'Energy' },
  { ticker: 'CVX',   name: 'Chevron',                type: 'value',  sector: 'Energy' },
  { ticker: 'COP',   name: 'ConocoPhillips',         type: 'value',  sector: 'Energy' },
  { ticker: 'EOG',   name: 'EOG Resources',          type: 'value',  sector: 'Energy' },
  { ticker: 'SLB',   name: 'SLB',                    type: 'value',  sector: 'Energy' },
  { ticker: 'MPC',   name: 'Marathon Petroleum',     type: 'value',  sector: 'Energy' },
  { ticker: 'OXY',   name: 'Occidental Petroleum',   type: 'value',  sector: 'Energy' },
  { ticker: 'CAT',   name: 'Caterpillar',            type: 'value',  sector: 'Industrials' },
  { ticker: 'RTX',   name: 'RTX Corporation',        type: 'value',  sector: 'Industrials' },
  { ticker: 'HON',   name: 'Honeywell',              type: 'value',  sector: 'Industrials' },
  { ticker: 'LMT',   name: 'Lockheed Martin',        type: 'value',  sector: 'Industrials' },
  { ticker: 'NOC',   name: 'Northrop Grumman',       type: 'value',  sector: 'Industrials' },
  { ticker: 'GD',    name: 'General Dynamics',       type: 'value',  sector: 'Industrials' },
  { ticker: 'BA',    name: 'Boeing',                 type: 'value',  sector: 'Industrials' },
  { ticker: 'UPS',   name: 'UPS',                    type: 'value',  sector: 'Industrials' },
  { ticker: 'UNP',   name: 'Union Pacific',          type: 'value',  sector: 'Industrials' },
  { ticker: 'DE',    name: 'John Deere',             type: 'value',  sector: 'Industrials' },
  { ticker: 'ETN',   name: 'Eaton Corporation',      type: 'value',  sector: 'Industrials' },
  { ticker: 'ITW',   name: 'Illinois Tool Works',    type: 'value',  sector: 'Industrials' },
  { ticker: 'EMR',   name: 'Emerson Electric',       type: 'value',  sector: 'Industrials' },
  { ticker: 'WM',    name: 'Waste Management',       type: 'value',  sector: 'Industrials' },
  { ticker: 'IBM',   name: 'IBM',                    type: 'value',  sector: 'Technology' },
  { ticker: 'INTC',  name: 'Intel',                  type: 'value',  sector: 'Technology' },
  { ticker: 'CSCO',  name: 'Cisco',                  type: 'value',  sector: 'Technology' },
  { ticker: 'TXN',   name: 'Texas Instruments',      type: 'value',  sector: 'Technology' },
  { ticker: 'ACN',   name: 'Accenture',              type: 'value',  sector: 'Technology' },
  { ticker: 'WMT',   name: 'Walmart',                type: 'value',  sector: 'Consumer' },
  { ticker: 'HD',    name: 'Home Depot',             type: 'value',  sector: 'Consumer' },
  { ticker: 'LOW',   name: "Lowe's",                 type: 'value',  sector: 'Consumer' },
  { ticker: 'MCD',   name: "McDonald's",             type: 'value',  sector: 'Consumer' },
  { ticker: 'DIS',   name: 'Walt Disney',            type: 'value',  sector: 'Consumer' },
  { ticker: 'CMCSA', name: 'Comcast',                type: 'value',  sector: 'Consumer' },
  { ticker: 'TGT',   name: 'Target',                 type: 'value',  sector: 'Consumer' },
  { ticker: 'PG',    name: 'Procter & Gamble',       type: 'value',  sector: 'Consumer' },
  { ticker: 'KO',    name: 'Coca-Cola',              type: 'value',  sector: 'Consumer' },
  { ticker: 'PEP',   name: 'PepsiCo',                type: 'value',  sector: 'Consumer' },
  { ticker: 'PM',    name: 'Philip Morris',          type: 'value',  sector: 'Consumer' },
  { ticker: 'MO',    name: 'Altria',                 type: 'value',  sector: 'Consumer' },
  { ticker: 'CL',    name: 'Colgate-Palmolive',      type: 'value',  sector: 'Consumer' },
  { ticker: 'KMB',   name: 'Kimberly-Clark',         type: 'value',  sector: 'Consumer' },
  { ticker: 'GIS',   name: 'General Mills',          type: 'value',  sector: 'Consumer' },
  { ticker: 'JNJ',   name: 'Johnson & Johnson',      type: 'value',  sector: 'Healthcare' },
  { ticker: 'MRK',   name: 'Merck',                  type: 'value',  sector: 'Healthcare' },
  { ticker: 'ABT',   name: 'Abbott Laboratories',    type: 'value',  sector: 'Healthcare' },
  { ticker: 'AMGN',  name: 'Amgen',                  type: 'value',  sector: 'Healthcare' },
  { ticker: 'TMO',   name: 'Thermo Fisher',          type: 'value',  sector: 'Healthcare' },
  { ticker: 'DHR',   name: 'Danaher',                type: 'value',  sector: 'Healthcare' },
  { ticker: 'UNH',   name: 'UnitedHealth',           type: 'value',  sector: 'Healthcare' },
  { ticker: 'ABBV',  name: 'AbbVie',                 type: 'value',  sector: 'Healthcare' },
  { ticker: 'BMY',   name: 'Bristol-Myers Squibb',   type: 'value',  sector: 'Healthcare' },
  { ticker: 'PFE',   name: 'Pfizer',                 type: 'value',  sector: 'Healthcare' },
  { ticker: 'GILD',  name: 'Gilead Sciences',        type: 'value',  sector: 'Healthcare' },
  { ticker: 'MDT',   name: 'Medtronic',              type: 'value',  sector: 'Healthcare' },
  { ticker: 'NOVO-B.CO', name: 'Novo Nordisk',       type: 'value',  sector: 'Healthcare' },
  { ticker: 'NEE',   name: 'NextEra Energy',         type: 'value',  sector: 'Utilities' },
  { ticker: 'DUK',   name: 'Duke Energy',            type: 'value',  sector: 'Utilities' },
  { ticker: 'SO',    name: 'Southern Company',       type: 'value',  sector: 'Utilities' },
  { ticker: 'D',     name: 'Dominion Energy',        type: 'value',  sector: 'Utilities' },
  { ticker: 'AEP',   name: 'American Electric Power',type: 'value',  sector: 'Utilities' },
  { ticker: 'EXC',   name: 'Exelon',                 type: 'value',  sector: 'Utilities' },
  { ticker: 'VZ',    name: 'Verizon',                type: 'value',  sector: 'Telecom' },
  { ticker: 'T',     name: 'AT&T',                   type: 'value',  sector: 'Telecom' },
  { ticker: 'LIN',   name: 'Linde',                  type: 'value',  sector: 'Materials' },
  { ticker: 'SHW',   name: 'Sherwin-Williams',       type: 'value',  sector: 'Materials' },
  { ticker: 'NEM',   name: 'Newmont',                type: 'value',  sector: 'Materials' },
  { ticker: 'FCX',   name: 'Freeport-McMoRan',       type: 'value',  sector: 'Materials' },
  // REIT
  { ticker: 'O',     name: 'Realty Income',          type: 'reit',   sector: 'REIT' },
  { ticker: 'VICI',  name: 'VICI Properties',        type: 'reit',   sector: 'REIT' },
  { ticker: 'PLD',   name: 'Prologis',               type: 'reit',   sector: 'REIT' },
  { ticker: 'PSA',   name: 'Public Storage',         type: 'reit',   sector: 'REIT' },
  { ticker: 'DLR',   name: 'Digital Realty',         type: 'reit',   sector: 'REIT' },
  { ticker: 'EQIX',  name: 'Equinix',                type: 'reit',   sector: 'REIT' },
  { ticker: 'AMT',   name: 'American Tower',         type: 'reit',   sector: 'REIT' },
  { ticker: 'CCI',   name: 'Crown Castle',           type: 'reit',   sector: 'REIT' },
  { ticker: 'SPG',   name: 'Simon Property Group',   type: 'reit',   sector: 'REIT' },
  { ticker: 'AVB',   name: 'AvalonBay Communities',  type: 'reit',   sector: 'REIT' },
  { ticker: 'EQR',   name: 'Equity Residential',     type: 'reit',   sector: 'REIT' },
  { ticker: 'WPC',   name: 'W. P. Carey',            type: 'reit',   sector: 'REIT' },
  { ticker: 'IRM',   name: 'Iron Mountain',          type: 'reit',   sector: 'REIT' },
  { ticker: 'ARE',   name: 'Alexandria Real Estate',  type: 'reit',   sector: 'REIT' },
  { ticker: 'WELL',  name: 'Welltower',              type: 'reit',   sector: 'REIT' },
  { ticker: 'VTR',   name: 'Ventas',                 type: 'reit',   sector: 'REIT' },
  { ticker: 'NNN',   name: 'NNN REIT',               type: 'reit',   sector: 'REIT' },
  { ticker: 'EXR',   name: 'Extra Space Storage',    type: 'reit',   sector: 'REIT' },
  { ticker: 'ESS',   name: 'Essex Property Trust',   type: 'reit',   sector: 'REIT' },
  { ticker: 'MAA',   name: 'Mid-America Apartment',  type: 'reit',   sector: 'REIT' },
  { ticker: 'UDR',   name: 'UDR Inc.',               type: 'reit',   sector: 'REIT' },
  { ticker: 'CPT',   name: 'Camden Property Trust',  type: 'reit',   sector: 'REIT' },
  { ticker: 'KIM',   name: 'Kimco Realty',           type: 'reit',   sector: 'REIT' },
  { ticker: 'REG',   name: 'Regency Centers',        type: 'reit',   sector: 'REIT' },
  { ticker: 'FRT',   name: 'Federal Realty',         type: 'reit',   sector: 'REIT' },
  { ticker: 'BXP',   name: 'Boston Properties',      type: 'reit',   sector: 'REIT' },
  // INTERNACIONAIS (bolsas de origem, plano Ultimate)
  { ticker: '2330.TW',   name: 'TSMC',                type: 'growth', sector: 'Technology' },
  { ticker: 'ASML.AS',   name: 'ASML',                type: 'growth', sector: 'Technology' },
  { ticker: 'NESN.SW',   name: 'Nestlé',              type: 'value',  sector: 'Consumer' },
  { ticker: 'TCEHY',     name: 'Tencent',             type: 'growth', sector: 'Technology' },
  { ticker: 'BABA',      name: 'Alibaba',             type: 'growth', sector: 'Technology' },
  { ticker: 'SIE.DE',    name: 'Siemens',             type: 'value',  sector: 'Industrials' },
  { ticker: 'MC.PA',     name: 'LVMH',                type: 'growth', sector: 'Consumer' },
  { ticker: 'ARM',       name: 'Arm Holdings',        type: 'growth', sector: 'Technology' },
  { ticker: '005930.KS', name: 'Samsung Electronics', type: 'growth', sector: 'Technology' },
  { ticker: '000660.KS', name: 'SK Hynix',            type: 'growth', sector: 'Technology' },
  { ticker: 'SAB.MC',    name: 'Banco Sabadell',      type: 'value',  sector: 'Finance' },
  { ticker: 'SAP.DE',    name: 'SAP',                 type: 'growth', sector: 'Technology' },
  { ticker: 'RACE.MI',   name: 'Ferrari',             type: 'growth', sector: 'Consumer' },
  { ticker: 'SAF.PA',    name: 'Safran',              type: 'value',  sector: 'Industrials' },
  { ticker: 'RHM.DE',    name: 'Rheinmetall',         type: 'value',  sector: 'Industrials' },
  { ticker: 'DG.PA',     name: 'Vinci',               type: 'value',  sector: 'Industrials' },
]

// ─────────────────────────────────────────────────────────────
// FMP API HELPER
// ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fmpGet(path: string, params: Record<string, string> = {}): Promise<FmpRecord | null> {
  try {
    await fmpThrottle()
    const { data } = await axios.get<unknown>(`${FMP_BASE}${path}`, {
      params: { apikey: process.env.FMP_API_KEY, ...params },
      timeout: 15000
    })
    return firstRecord(data)
  } catch {
    return null
  }
}

function safe(val: unknown, mult = 1): number | null {
  if (val === null || val === undefined || isNaN(Number(val))) return null
  return Math.round(Number(val) * mult * 10000) / 10000
}

// ─────────────────────────────────────────────────────────────
// FETCH POR AÇÃO
// ─────────────────────────────────────────────────────────────

async function fetchStock(ticker: string, isReit: boolean) {
  // Os sleeps manuais entre chamadas foram removidos: o fmpThrottle já é o
  // único gate de ritmo partilhado por toda a Clareza (2.400/min, plano
  // Ultimate) — duplicar o limite aqui só tornava o refresh mais lento sem
  // proteger nada a mais.
  const p = await fmpGet('/profile', { symbol: ticker })
  const r = await fmpGet('/ratios-ttm', { symbol: ticker })
  const m = await fmpGet('/key-metrics-ttm', { symbol: ticker })

  const price  = p?.price            ?? null
  const change = p?.changePercentage ?? null

  let perf12m: number | null = null
  if (p?.range && price) {
    const low52 = parseFloat(String(p.range).split('-')[0])
    if (low52 > 0) perf12m = Math.round(((price - low52) / low52) * 10000) / 100
  }

  let pFfo: number | null = null
  let ffoYield: number | null = null
  let ffoPayoutRatio: number | null = null

  if (isReit) {
    const is = await fmpGet('/income-statement', { symbol: ticker, period: 'annual', limit: '1' })
    const cf = await fmpGet('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '1' })

    const netIncome = is?.netIncome ?? null
    const da        = is?.depreciationAndAmortization ?? cf?.depreciationAndAmortization ?? null
    const shares    = is?.weightedAverageShsOut ?? null
    const divsPaid  = cf?.netDividendsPaid != null ? Math.abs(cf.netDividendsPaid) : null

    if (netIncome !== null && da !== null) {
      const ffo = netIncome + da
      if (shares && shares > 0 && price) {
        const ffoPs = ffo / shares
        if (ffoPs > 0) {
          pFfo     = Math.round((price / ffoPs) * 100) / 100
          ffoYield = Math.round((ffoPs / price) * 10000) / 100
        }
      }
      if (divsPaid !== null && ffo > 0) {
        ffoPayoutRatio = Math.round((divsPaid / ffo) * 10000) / 100
      }
    }
  }

  return {
    price,
    change,
    perf12m,
    pe:             r?.priceToEarningsRatioTTM                                         ?? null,
    peg:            r?.forwardPriceToEarningsGrowthRatioTTM ?? r?.priceToEarningsGrowthRatioTTM ?? null,
    ps:             r?.priceToSalesRatioTTM                                             ?? null,
    pb:             r?.priceToBookRatioTTM                                              ?? null,
    evEbitda:       m?.evToEBITDATTM                                                   ?? null,
    fcfYield:       safe(m?.freeCashFlowYieldTTM,   100),
    roe:            safe(m?.returnOnEquityTTM,       100),
    netMargin:      safe(r?.netProfitMarginTTM,      100),
    grossMarginTTM: safe(r?.grossProfitMarginTTM,    100),
    dividendYield:  safe(r?.dividendYieldTTM,        100),
    payoutRatio:    safe(r?.dividendPayoutRatioTTM,  100),
    debtEquity:     r?.debtToEquityRatioTTM                                            ?? null,
    debtEbitda:     m?.netDebtToEBITDATTM                                              ?? null,
    revenueGrowth:  null,
    perf3m:         null,
    pFfo,
    ffoYield,
    ffoPayoutRatio,
    updated: new Date().toISOString(),
    currency: p?.currency ?? null,
    exchange: p?.exchangeShortName ?? p?.exchange ?? null
  }
}

// ─────────────────────────────────────────────────────────────
// REFRESH COMPLETO (chamado pelo cron e pelo endpoint manual)
// ─────────────────────────────────────────────────────────────

export async function refreshClarezaData(): Promise<{ total: number; errors: number }> {
  if (!process.env.FMP_API_KEY) {
    throw new Error('FMP_API_KEY nao configurada')
  }

  console.log(`📈 [Clareza] Iniciando refresh de ${UNIVERSE.length} ações...`)

  let errors = 0

  const results = await runWithConcurrency(
    UNIVERSE.map(stock => async () => {
      try {
        const data = await fetchStock(stock.ticker, stock.type === 'reit')
        return { ticker: stock.ticker, name: stock.name, type: stock.type, sector: stock.sector, data }
      } catch (err: unknown) {
        errors++
        console.error(`❌ [Clareza] Erro em ${stock.ticker}:`, errorMessage(err))
        return { ticker: stock.ticker, name: stock.name, type: stock.type, sector: stock.sector, data: null }
      }
    }),
    // 12 ações em simultâneo — o fmpThrottle global já garante que a soma de
    // chamadas (deste + top10 + raio-x) nunca passa de 2.400/min, por isso
    // subir a concorrência aqui só acelera o refresh, não arrisca o limite.
    12
  )

  // Guardar em Redis
  await cacheService.set(CLAREZA_CACHE_KEY, results, CACHE_TTL)

  // Guardar em MongoDB (persistência durável — mesmo se Redis reiniciar)
  try {
    await ClarezaMarketData.create({
      fetchedAt:  new Date(),
      stockCount: UNIVERSE.length - errors,
      errors,
      stocks: results
    })
    // Manter apenas os últimos 5 snapshots
    const all = await ClarezaMarketData.find({}, '_id fetchedAt').sort({ fetchedAt: -1 }).lean()
    if (all.length > 5) {
      const toDelete = all.slice(5).map(d => d._id)
      await ClarezaMarketData.deleteMany({ _id: { $in: toDelete } })
    }
    console.log(`💾 [Clareza] Snapshot guardado na BD`)
  } catch (err: unknown) {
    console.error('⚠️ [Clareza] Erro ao guardar snapshot na BD:', errorMessage(err))
  }

  console.log(`✅ [Clareza] Refresh completo — ${UNIVERSE.length - errors} ok, ${errors} erros`)

  return { total: UNIVERSE.length, errors }
}

// ─────────────────────────────────────────────────────────────
// GET COM CACHE (Redis → MongoDB → FMP API)
// ─────────────────────────────────────────────────────────────

export async function getClarezaData(): Promise<ClarezaStockEntry[] | null> {
  // 1. Tentar Redis
  const cached = await cacheService.get<ClarezaStockEntry[]>(CLAREZA_CACHE_KEY)
  if (cached) return cached

  // 2. Redis miss → tentar MongoDB (dados persistidos do último refresh)
  try {
    const latest = await ClarezaMarketData.findOne().sort({ fetchedAt: -1 }).lean()
    if (latest?.stocks?.length) {
      console.log(`📦 [Clareza] Cache Redis vazio — a servir snapshot da BD (${latest.fetchedAt})`)
      // Repor em Redis para as próximas chamadas
      await cacheService.set(CLAREZA_CACHE_KEY, latest.stocks, CACHE_TTL)
      return latest.stocks
    }
  } catch (err: unknown) {
    console.error('⚠️ [Clareza] Erro ao ler snapshot da BD:', errorMessage(err))
  }

  // 3. Nenhum dado disponivel. Nao chamar FMP em load publico.
  console.warn('[Clareza] Sem cache Redis e sem snapshot MongoDB. Aguardar cron ClarezaRefresh.')
  return null
}

// ─────────────────────────────────────────────────────────────
// ANÁLISE REIT POR TICKER (live FMP + cache por ticker)
// ─────────────────────────────────────────────────────────────

// Variante de fmpGet que devolve o array completo (não só o [0]).
async function fmpGetArray(path: string, params: Record<string, string> = {}): Promise<FmpRecord[]> {
  try {
    await fmpThrottle()
    const { data } = await axios.get<unknown>(`${FMP_BASE}${path}`, {
      params: { apikey: process.env.FMP_API_KEY, ...params },
      timeout: 15000
    })
    return recordArray(data)
  } catch {
    return []
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown): number | null =>
  v === null || v === undefined || isNaN(Number(v)) ? null : round2(Number(v))

const REIT_CACHE_PREFIX = 'clareza:reit:'
const STOCK_CACHE_PREFIX = 'clareza:stock:v2:'
const REIT_VALUATION_CACHE_PREFIX = 'clareza:reitval:'
const REIT_CACHE_TTL = 86400 // 24 horas

// Mapeia uma entrada da cache do cron clareza para o formato da análise REIT.
// Evita chamadas FMP para os tickers que o cron já atualiza 3×/dia.
function mapClarezaToReit(entry: ClarezaStockEntry) {
  const d = entry?.data ?? {}
  return {
    ticker:    entry.ticker,
    name:      entry.name ?? entry.ticker,
    sector:    entry.sector ?? null,
    industry:  null,
    price:     d.price ?? null,
    change:    d.change ?? null,
    marketCap: null,
    currency:  'USD',
    metrics: {
      pFfo:             d.pFfo ?? null,
      ffoYield:         d.ffoYield ?? null,
      ffoPerShare:      null,            // não calculado no cron → link
      ffoCagr5y:        null,            // não calculado no cron → link
      ffoPayout:        d.ffoPayoutRatio ?? null,
      netDebtToEbitda:  d.debtEbitda ?? null,
      evToEbitda:       d.evEbitda ?? null,
      dividendYield:    d.dividendYield ?? null,
      payoutRatio:      d.payoutRatio ?? null,
      interestCoverage: null,            // não calculado no cron → link
    },
    source:  'clareza-cache',
    updated: d.updated ?? new Date().toISOString()
  }
}

function div(a: number | null, b: number | null): number | null {
  return a !== null && b !== null && b !== 0 ? a / b : null
}

function roundedRatio(a: number | null, b: number | null, multiplier = 1): number | null {
  const ratio = div(a, b)
  return ratio === null ? null : round2(ratio * multiplier)
}

function metricNum(v: unknown): number | null {
  return v === null || v === undefined || isNaN(Number(v)) ? null : Number(v)
}

function roundOrNull(v: number | null): number | null {
  return v === null || !Number.isFinite(v) ? null : round2(v)
}

function yearOf(row: FmpRecord | null | undefined): string | null {
  return String(row?.calendarYear ?? row?.year ?? row?.date ?? '').slice(0, 4) || null
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v))
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}

function calcCagr(values: number[]): number | null {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0)
  if (valid.length < 2) return null
  const newest = valid[0]
  const oldest = valid[valid.length - 1]
  return Math.pow(newest / oldest, 1 / (valid.length - 1)) - 1
}

function buildFfoRow(income: FmpRecord | null | undefined, cashFlow?: FmpRecord | null) {
  const shares = metricNum(income?.weightedAverageShsOutDil ?? income?.weightedAverageShsOut)
  const netIncome = metricNum(income?.netIncome)
  const depreciation = metricNum(
    income?.depreciationAndAmortization ?? cashFlow?.depreciationAndAmortization
  )
  const capex = metricNum(cashFlow?.capitalExpenditure)
  const ffo = netIncome !== null && depreciation !== null ? netIncome + depreciation : null
  const ffoPerShare = div(ffo, shares)
  const capexPerShare = div(capex, shares)
  const affo = ffo !== null && capex !== null ? ffo - Math.abs(capex) : null
  const affoPerShare = div(affo, shares)

  return { shares, ffo, ffoPerShare, capex, capexPerShare, affoPerShare }
}

function cashFlowByYear(cashFlows: FmpRecord[]) {
  const byYear = new Map<string, FmpRecord>()
  for (const row of cashFlows) {
    const year = yearOf(row)
    if (year) byYear.set(year, row)
  }
  return byYear
}

function aggregateDividends(rows: FmpRecord[]) {
  const byYear = new Map<string, number>()
  for (const row of rows) {
    const year = yearOf(row)
    const dividend = metricNum(row?.adjDividend ?? row?.dividend)
    if (!year || dividend === null) continue
    byYear.set(year, (byYear.get(year) ?? 0) + dividend)
  }

  return Array.from(byYear.entries())
    .map(([year, annual]) => ({ year, annual: round2(annual) }))
    .sort((a, b) => Number(b.year) - Number(a.year))
    .slice(0, 6)
}

function mapClarezaToStock(entry: ClarezaStockEntry) {
  const d = entry?.data ?? {}
  return {
    ticker:    entry.ticker,
    name:      entry.name ?? entry.ticker,
    sector:    entry.sector ?? null,
    industry:  null,
    price:     d.price ?? null,
    change:    d.change ?? null,
    beta:      null,
    marketCap: null,
    currency:  'USD',
    metrics: {
      eps:              null,
      pe:               d.pe ?? null,
      vpa:              null,
      pVpa:             d.pb ?? null,
      cagrEps:          null,
      peg:              d.peg ?? null,
      grossMargin:      d.grossMarginTTM ?? null,
      ebitdaMargin:     null,
      netMargin:        d.netMargin ?? null,
      roe:              d.roe ?? null,
      netDebtToEbitda:  d.debtEbitda ?? null,
      currentRatio:     null,
      cashRatio:        null,
      dividendYield:    d.dividendYield ?? null,
      payoutRatio:      d.payoutRatio ?? null,
    },
    source:  'clareza-cache',
    updated: d.updated ?? new Date().toISOString()
  }
}

export async function getReitAnalysis(rawTicker: string) {
  if (!process.env.FMP_API_KEY) throw new Error('FMP_API_KEY nao configurada')

  const ticker = normalizeTicker(rawTicker)
  if (!isValidTicker(ticker)) throw new Error('Ticker invalido')

  const cacheKey = REIT_CACHE_PREFIX + ticker
  const cached = await cacheService.get<unknown>(cacheKey)
  if (isRecord(cached)) return cached

  // 1. Reutilizar a cache do cron clareza — 0 chamadas FMP para tickers do universo.
  try {
    const universe = await getClarezaData()
    const hit = universe?.find(s => s.ticker === ticker && s.data)
    if (hit) {
      const cachedResult = mapClarezaToReit(hit)
      await cacheService.set(cacheKey, cachedResult, REIT_CACHE_TTL)
      return cachedResult
    }
  } catch {
    /* cache indisponível → segue para fetch live */
  }

  // 2. Fora do universo → fetch live (com retry a 429) e cache 24h.
  // Profile com diagnóstico: distingue falha da FMP (key/plano/quota) de ticker inexistente.
  let profile: FmpRecord | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fmpThrottle()
      const { data } = await axios.get<unknown>(`${FMP_BASE}/profile`, {
        params: { apikey: process.env.FMP_API_KEY, symbol: ticker },
        timeout: 15000
      })
      profile = firstRecord(data)
      break
    } catch (e: unknown) {
      const { status, body, message } = fmpErrorDetails(e)
      if (status === 429 && attempt === 0) {
        await sleep(1500) // rate limit momentâneo (refresh do cron) → 1 retry
        continue
      }
      throw new Error(`Falha ao contactar a FMP${status ? ` (HTTP ${status})` : ''}${body ? `: ${body}` : `: ${message || 'erro de rede'}`}`)
    }
  }
  await sleep(150)
  if (!profile || !profile.symbol) throw new Error('Ticker nao encontrado')

  const ratios  = await fmpGet('/ratios-ttm', { symbol: ticker }); await sleep(150)
  const metrics = await fmpGet('/key-metrics-ttm', { symbol: ticker }); await sleep(150)
  const incomes = await fmpGetArray('/income-statement', { symbol: ticker, period: 'annual', limit: '6' }); await sleep(150)
  const cf      = await fmpGet('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '1' })

  const price = profile.price ?? null

  // FFO ≈ Net Income + Depreciação & Amortização (último exercício anual)
  const latest  = incomes[0] ?? null
  const ni0     = latest?.netIncome ?? null
  const da0     = latest?.depreciationAndAmortization ?? cf?.depreciationAndAmortization ?? null
  const shares0 = latest?.weightedAverageShsOut ?? null

  const ffo         = ni0 !== null && da0 !== null ? ni0 + da0 : null
  const ffoPerShare = ffo !== null && shares0 ? ffo / shares0 : null
  const pFfo        = ffoPerShare && price ? round2(price / ffoPerShare) : null
  const ffoYield    = ffoPerShare && price ? round2((ffoPerShare / price) * 100) : null

  // FFO 5Y CAGR a partir da série anual disponível (mais recente → mais antigo)
  let ffoCagr5y: number | null = null
  const ffoSeries = incomes
    .map(s =>
      s?.netIncome != null && s?.depreciationAndAmortization != null
        ? s.netIncome + s.depreciationAndAmortization
        : null
    )
    .filter((v: number | null): v is number => v !== null && v > 0)
  if (ffoSeries.length >= 2) {
    const newest = ffoSeries[0]
    const oldest = ffoSeries[ffoSeries.length - 1]
    const years  = ffoSeries.length - 1
    ffoCagr5y = round2((Math.pow(newest / oldest, 1 / years) - 1) * 100)
  }

  const divsPaid  = cf?.netDividendsPaid != null ? Math.abs(cf.netDividendsPaid) : null
  const ffoPayout = divsPaid !== null && ffo && ffo > 0 ? round2((divsPaid / ffo) * 100) : null

  const result = {
    ticker,
    name:      profile.companyName ?? ticker,
    sector:    profile.sector ?? null,
    industry:  profile.industry ?? null,
    price,
    change:    profile.changePercentage ?? null,
    marketCap: profile.marketCap ?? null,
    currency:  profile.currency ?? 'USD',
    metrics: {
      pFfo,
      ffoYield,
      ffoPerShare:     ffoPerShare !== null ? round2(ffoPerShare) : null,
      ffoCagr5y,
      ffoPayout,
      netDebtToEbitda: num(metrics?.netDebtToEBITDATTM),
      evToEbitda:      num(metrics?.evToEBITDATTM),
      dividendYield:   safe(ratios?.dividendYieldTTM, 100),
      payoutRatio:     safe(ratios?.dividendPayoutRatioTTM, 100),
      interestCoverage: num(
        ratios?.interestCoverageRatioTTM ?? ratios?.interestCoverageTTM ?? metrics?.interestCoverageTTM
      ),
    },
    ffoYearsUsed: ffoSeries.length,
    source: 'live',
    updated: new Date().toISOString()
  }

  await cacheService.set(cacheKey, result, REIT_CACHE_TTL)
  return result
}

export async function getReitValuation(rawTicker: string) {
  if (!process.env.FMP_API_KEY) throw new Error('FMP_API_KEY nao configurada')

  const ticker = normalizeTicker(rawTicker)
  if (!isValidTicker(ticker)) throw new Error('Ticker invalido')

  const cacheKey = REIT_VALUATION_CACHE_PREFIX + ticker
  const cached = await cacheService.get<unknown>(cacheKey)
  if (isRecord(cached)) return cached

  let profile: FmpRecord | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fmpThrottle()
      const { data } = await axios.get<unknown>(`${FMP_BASE}/profile`, {
        params: { apikey: process.env.FMP_API_KEY, symbol: ticker },
        timeout: 15000
      })
      profile = firstRecord(data)
      break
    } catch (e: unknown) {
      const { status, body, message } = fmpErrorDetails(e)
      if (status === 429 && attempt === 0) {
        await sleep(1500)
        continue
      }
      throw new Error(`Falha ao contactar a FMP${status ? ` (HTTP ${status})` : ''}${body ? `: ${body}` : `: ${message || 'erro de rede'}`}`)
    }
  }
  await sleep(150)
  if (!profile || !profile.symbol) throw new Error('Ticker nao encontrado')

  const incomes = await fmpGetArray('/income-statement', { symbol: ticker, period: 'annual', limit: '6' }); await sleep(150)
  const cashFlows = await fmpGetArray('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '6' }); await sleep(150)

  let enterpriseValues: FmpRecord[] = []
  try {
    enterpriseValues = await fmpGetArray('/enterprise-values', { symbol: ticker, period: 'annual', limit: '6' })
  } catch {
    enterpriseValues = []
  }
  await sleep(150)

  let dividendsRaw: FmpRecord[] = []
  try {
    dividendsRaw = await fmpGetArray('/dividends', { symbol: ticker, limit: '120' })
  } catch {
    dividendsRaw = []
  }
  await sleep(150)

  // Cockpit: balanço (equity, dívida) + price target.
  let balance: FmpRecord | null = null
  try {
    balance = await fmpGet('/balance-sheet-statement', { symbol: ticker, period: 'annual', limit: '1' })
  } catch {
    balance = null
  }
  await sleep(150)

  let priceTarget: number | null = null
  try {
    const pt = await fmpGet('/price-target-summary', { symbol: ticker })
    priceTarget = num(
      pt?.lastMonthAvgPriceTarget ?? pt?.allTimeAvgPriceTarget ?? pt?.targetConsensus ?? pt?.priceTarget
    )
  } catch {
    priceTarget = null
  }
  await sleep(150)

  let peerSymbols: string[] = []
  try {
    // /stock-peers devolve um array de objetos de pares; usar fmpGetArray (não fmpGet).
    const peerArr = await fmpGetArray('/stock-peers', { symbol: ticker })
    peerSymbols = peerArr
      .flatMap((peer): unknown[] =>
        Array.isArray(peer?.peersList) ? peer.peersList : [peer?.symbol ?? peer]
      )
      .filter((sym): sym is string => typeof sym === 'string')
      .map(sym => normalizeTicker(sym))
      .filter((sym: string) => isValidTicker(sym) && sym !== ticker)
      .slice(0, 5)
  } catch {
    peerSymbols = []
  }
  // Fallback: se a FMP não der pares, usar REITs do universo do cron.
  if (peerSymbols.length === 0) {
    peerSymbols = UNIVERSE
      .filter((s) => s.type === 'reit' && s.ticker !== ticker)
      .slice(0, 5)
      .map((s) => s.ticker)
  }
  await sleep(150)

  const cashByYear = cashFlowByYear(cashFlows)
  const enterpriseByYear = new Map<string, FmpRecord>()
  for (const row of enterpriseValues) {
    const year = yearOf(row)
    if (year) enterpriseByYear.set(year, row)
  }

  const history = incomes
    .map(income => {
      const year = yearOf(income)
      const cashFlow = year ? cashByYear.get(year) : null
      const enterprise = year ? enterpriseByYear.get(year) : null
      const ffoRow = buildFfoRow(income, cashFlow)
      const yearPrice = metricNum(enterprise?.stockPrice ?? enterprise?.price)
      const pFfo = div(yearPrice, ffoRow.ffoPerShare)
      return {
        year,
        price: roundOrNull(yearPrice),
        ffoPerShare: roundOrNull(ffoRow.ffoPerShare),
        pFfo: roundOrNull(pFfo)
      }
    })
    .filter((row) => row.year)

  const latestIncome = incomes[0] ?? null
  const latestYear = yearOf(latestIncome)
  const latestCashFlow = latestYear ? cashByYear.get(latestYear) : cashFlows[0]
  const currentRow = buildFfoRow(latestIncome, latestCashFlow)
  const profileShares = metricNum(profile.sharesOutstanding ?? profile.sharesOut)
  const sharesOut = currentRow.shares ?? profileShares
  const price = metricNum(profile.price)
  const allDividends = aggregateDividends(dividendsRaw)
  // Excluir o ano civil corrente (quase sempre parcial) dos cálculos do DDM.
  const currentYear = String(new Date().getUTCFullYear())
  const completeDividends = allDividends.filter((row) => row.year !== currentYear)
  const dividends = completeDividends.length ? completeDividends : allDividends
  // Dividendo anual = último ANO COMPLETO agregado (como o ficheiro Excel);
  // lastDividend (rate anualizado do profile) só como fallback. NUNCA o ano parcial.
  const lastDivAnnual = num(profile.lastDividend ?? profile.lastDiv)
  const dividendAnnual = dividends[0]?.annual
    ?? (lastDivAnnual !== null && lastDivAnnual > 0 ? lastDivAnnual : null)
    ?? null
  const dividendCagrValue = calcCagr(dividends.map(row => row.annual))
  const dividendCagr = roundOrNull(dividendCagrValue === null ? null : dividendCagrValue * 100)

  const peerTasks = peerSymbols.map((peerTicker) => async () => {
    const [peerProfile, peerIncomes, peerCashFlows] = await Promise.all([
      fmpGet('/profile', { symbol: peerTicker }),
      fmpGetArray('/income-statement', { symbol: peerTicker, period: 'annual', limit: '1' }),
      fmpGetArray('/cash-flow-statement', { symbol: peerTicker, period: 'annual', limit: '1' })
    ])
    await sleep(150)
    const peerRow = buildFfoRow(peerIncomes[0], peerCashFlows[0])
    const peerPrice = metricNum(peerProfile?.price)
    return {
      ticker: peerTicker,
      name: peerProfile?.companyName ?? peerTicker,
      price: roundOrNull(peerPrice),
      ffoPerShare: roundOrNull(peerRow.ffoPerShare),
      capexPerShare: roundOrNull(peerRow.capexPerShare),
      affoPerShare: roundOrNull(peerRow.affoPerShare),
      pAffo: roundOrNull(div(peerPrice, peerRow.affoPerShare))
    }
  })
  const peers = peerTasks.length ? await runWithConcurrency(peerTasks, 2) : []

  const pFfoAvg = roundOrNull(average(history.slice(0, 5).map((row) => row.pFfo)))
  const pAffoAvg = roundOrNull(average(peers.map((peer) => peer.pAffo)))
  const affoPayout = dividendAnnual !== null && currentRow.affoPerShare
    ? round2((dividendAnnual / currentRow.affoPerShare) * 100)
    : null

  // ── Cockpit (resumo de indicadores, auto-preenchido) ──
  const cRevenue = metricNum(latestIncome?.revenue)
  const cNetIncome = metricNum(latestIncome?.netIncome)
  const cEbitda = metricNum(latestIncome?.ebitda)
  const cGross = metricNum(latestIncome?.grossProfit)
  const cOperating = metricNum(latestIncome?.operatingIncome)
  const cEps = metricNum(latestIncome?.epsdiluted ?? latestIncome?.eps) ?? div(cNetIncome, sharesOut)
  const cEquity = metricNum(balance?.totalStockholdersEquity)
  const cCash = metricNum(balance?.cashAndShortTermInvestments)
  const cTotalDebt = metricNum(
    balance?.totalDebt ?? ((metricNum(balance?.shortTermDebt) ?? 0) + (metricNum(balance?.longTermDebt) ?? 0))
  )
  const cNetDebt = metricNum(balance?.netDebt) ?? (cTotalDebt !== null && cCash !== null ? cTotalDebt - cCash : null)
  const pct = (n: number | null, d: number | null) => roundedRatio(n, d, 100)
  const histReturn = (idx: number) => {
    const past = metricNum(history[idx]?.price)
    return price !== null && past ? round2((price / past - 1) * 100) : null
  }
  const cockpit = {
    revenue: roundOrNull(cRevenue),
    netIncome: roundOrNull(cNetIncome),
    ebitda: roundOrNull(cEbitda),
    equity: roundOrNull(cEquity),
    netDebt: roundOrNull(cNetDebt),
    marketCap: num(profile.marketCap),
    grossMargin: pct(cGross, cRevenue),
    operatingMargin: pct(cOperating, cRevenue),
    netMargin: pct(cNetIncome, cRevenue),
    roe: pct(cNetIncome, cEquity),
    netDebtToEbitda: roundedRatio(cNetDebt, cEbitda),
    pFfo: roundOrNull(div(price, currentRow.ffoPerShare)),
    dividendYield: dividendAnnual !== null && price ? round2((dividendAnnual / price) * 100) : null,
    payoutEarnings: dividendAnnual !== null && cEps ? round2((dividendAnnual / cEps) * 100) : null,
    return1y: histReturn(1),
    return2y: histReturn(2),
    return5y: histReturn(5),
    priceTarget
  }

  const result = {
    ticker,
    name: profile.companyName ?? ticker,
    price: roundOrNull(price),
    beta: num(profile.beta),
    sharesOut: sharesOut !== null ? Math.round(sharesOut) : null,
    currency: profile.currency ?? 'USD',
    current: {
      ffo: roundOrNull(currentRow.ffo),
      ffoPerShare: roundOrNull(currentRow.ffoPerShare),
      affoPerShare: roundOrNull(currentRow.affoPerShare),
      dividendAnnual,
      capex: roundOrNull(currentRow.capex),
      capexPerShare: roundOrNull(currentRow.capexPerShare)
    },
    cockpit,
    history,
    pFfoAvg,
    dividends,
    dividendCagr,
    peers,
    pAffoAvg,
    affoPayout,
    source: 'live',
    updated: new Date().toISOString()
  }

  await cacheService.set(cacheKey, result, REIT_CACHE_TTL)
  return result
}

export async function getStockAnalysis(rawTicker: string) {
  if (!process.env.FMP_API_KEY) throw new Error('FMP_API_KEY nao configurada')

  const ticker = normalizeTicker(rawTicker)
  if (!isValidTicker(ticker)) throw new Error('Ticker invalido')

  const cacheKey = STOCK_CACHE_PREFIX + ticker
  const cached = await cacheService.get<unknown>(cacheKey)
  if (isRecord(cached)) return cached

  // Calcula sempre live (16 indicadores das demonstrações). A cache do cron
  // (parcial) é usada apenas como fallback se a FMP falhar (ver catch abaixo).
  let profile: FmpRecord | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fmpThrottle()
      const { data } = await axios.get<unknown>(`${FMP_BASE}/profile`, {
        params: { apikey: process.env.FMP_API_KEY, symbol: ticker },
        timeout: 15000
      })
      profile = firstRecord(data)
      break
    } catch (e: unknown) {
      const { status, body, message } = fmpErrorDetails(e)
      if (status === 429 && attempt === 0) {
        await sleep(1500)
        continue
      }
      // Live falhou (rate limit / erro) -> fallback parcial da cache do cron.
      try {
        const universe = await getClarezaData()
        const hit = universe?.find(s => s.ticker === ticker && s.data)
        if (hit) {
          const partial = mapClarezaToStock(hit)
          await cacheService.set(cacheKey, partial, REIT_CACHE_TTL)
          return partial
        }
      } catch { /* sem cache -> propaga o erro original */ }
      throw new Error(`Falha ao contactar a FMP${status ? ` (HTTP ${status})` : ''}${body ? `: ${body}` : `: ${message || 'erro de rede'}`}`)
    }
  }
  await sleep(150)
  if (!profile || !profile.symbol) throw new Error('Ticker nao encontrado')

  const incomes = await fmpGetArray('/income-statement', { symbol: ticker, period: 'annual', limit: '2' }); await sleep(150)
  const balance = await fmpGet('/balance-sheet-statement', { symbol: ticker, period: 'annual', limit: '1' }); await sleep(150)
  const cashFlow = await fmpGet('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '1' }); await sleep(150)
  const ratios = await fmpGet('/ratios-ttm', { symbol: ticker }); await sleep(150)
  const keyMetrics = await fmpGet('/key-metrics-ttm', { symbol: ticker })

  const latest = incomes[0] ?? null
  const previous = incomes[1] ?? null
  const price = metricNum(profile.price)
  const shares = metricNum(latest?.weightedAverageShsOutDil ?? latest?.weightedAverageShsOut)
  const previousShares = metricNum(previous?.weightedAverageShsOutDil ?? previous?.weightedAverageShsOut)
  const netIncome = metricNum(latest?.netIncome)
  const previousNetIncome = metricNum(previous?.netIncome)
  const revenue = metricNum(latest?.revenue)
  const grossProfit = metricNum(latest?.grossProfit)
  const ebitda = metricNum(latest?.ebitda)
  const equity = metricNum(balance?.totalStockholdersEquity)
  const currentAssets = metricNum(balance?.totalCurrentAssets)
  const currentLiabilities = metricNum(balance?.totalCurrentLiabilities)
  const cash = metricNum(balance?.cashAndShortTermInvestments)
  const shortTermDebt = metricNum(balance?.shortTermDebt)
  const longTermDebt = metricNum(balance?.longTermDebt)
  const derivedDebt = shortTermDebt !== null || longTermDebt !== null
    ? (shortTermDebt ?? 0) + (longTermDebt ?? 0)
    : null
  const totalDebt = metricNum(
    balance?.totalDebt ??
    balance?.totalDebtAndCapitalLeaseObligations ??
    derivedDebt
  )
  const netDebt = metricNum(balance?.netDebt) ?? (
    totalDebt !== null && cash !== null ? totalDebt - cash : null
  )
  const dividendsPaidRaw = cashFlow?.dividendsPaid ?? cashFlow?.netDividendsPaid
  const dividendsPaid = dividendsPaidRaw != null ? Math.abs(Number(dividendsPaidRaw)) : null

  const epsRaw = metricNum(latest?.epsdiluted ?? latest?.eps)
  const previousEpsRaw = metricNum(previous?.epsdiluted ?? previous?.eps)
  const epsValue = epsRaw ?? div(netIncome, shares)
  const previousEps = previousEpsRaw ?? div(previousNetIncome, previousShares)
  const vpaValue = div(equity, shares)
  const peValue = div(price, epsValue) ?? metricNum(ratios?.priceToEarningsRatioTTM)
  const pVpaValue = div(price, vpaValue) ?? metricNum(ratios?.priceToBookRatioTTM)
  const cagrEpsValue = epsValue !== null && previousEps !== null && previousEps !== 0
    ? ((epsValue / previousEps) - 1) * 100
    : null
  const pegValue = div(peValue, cagrEpsValue) ??
    metricNum(ratios?.forwardPriceToEarningsGrowthRatioTTM ?? ratios?.priceToEarningsGrowthRatioTTM)
  const dividendPerShare = div(dividendsPaid, shares)

  const result = {
    ticker,
    name:      profile.companyName ?? ticker,
    sector:    profile.sector ?? null,
    industry:  profile.industry ?? null,
    price,
    change:    profile.changePercentage ?? null,
    beta:      num(profile.beta),
    marketCap: profile.marketCap ?? null,
    currency:  profile.currency ?? 'USD',
    metrics: {
      eps:              epsValue !== null ? round2(epsValue) : null,
      pe:               peValue !== null ? round2(peValue) : null,
      vpa:              vpaValue !== null ? round2(vpaValue) : null,
      pVpa:             pVpaValue !== null ? round2(pVpaValue) : null,
      cagrEps:          cagrEpsValue !== null ? round2(cagrEpsValue) : null,
      peg:              pegValue !== null ? round2(pegValue) : null,
      grossMargin:      roundedRatio(grossProfit, revenue, 100) ?? safe(ratios?.grossProfitMarginTTM, 100),
      ebitdaMargin:     roundedRatio(ebitda, revenue, 100),
      netMargin:        roundedRatio(netIncome, revenue, 100) ?? safe(ratios?.netProfitMarginTTM, 100),
      roe:              roundedRatio(netIncome, equity, 100) ?? safe(keyMetrics?.returnOnEquityTTM, 100),
      netDebtToEbitda:  roundedRatio(netDebt, ebitda) ?? num(keyMetrics?.netDebtToEBITDATTM),
      currentRatio:     roundedRatio(currentAssets, currentLiabilities) ?? num(ratios?.currentRatioTTM),
      cashRatio:        roundedRatio(cash, currentLiabilities) ?? num(ratios?.cashRatioTTM),
      dividendYield:    dividendPerShare !== null && price !== null && price !== 0
        ? round2((dividendPerShare / price) * 100)
        : safe(ratios?.dividendYieldTTM, 100),
      payoutRatio:      dividendPerShare !== null && epsValue !== null && epsValue !== 0
        ? round2((dividendPerShare / epsValue) * 100)
        : safe(ratios?.dividendPayoutRatioTTM, 100),
    },
    source: 'live',
    updated: new Date().toISOString()
  }

  await cacheService.set(cacheKey, result, REIT_CACHE_TTL)
  return result
}
