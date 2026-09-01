type JsonRecord = Readonly<Record<string, unknown>>

export interface CoreRaioxAssetSource {
  readonly generationId: string
  readonly ticker: string
  readonly name: string
  readonly sector: string
  readonly data: JsonRecord
  readonly evaluation: JsonRecord | null
}

export interface CoreRaioxComplementSource {
  readonly profileExtra: JsonRecord
  readonly forwardPe: number | null
  readonly annualIncome: readonly unknown[]
  readonly annualCashFlow: readonly unknown[]
  readonly quarterlyIncome: readonly unknown[]
  readonly quarterlyCashFlow: readonly unknown[]
  readonly annualRatios: readonly unknown[]
  readonly gradesConsensus: JsonRecord
  readonly priceTargetConsensus: JsonRecord
  readonly earnings: readonly unknown[]
  readonly dividends: readonly unknown[]
  readonly peerRatios: JsonRecord
  readonly momentum: JsonRecord | null
  readonly segmentation: readonly unknown[]
  readonly updated: string
}

export type ComplementCoverageStatus = 'available' | 'missing'

const COMPLEMENT_KEYS = [
  'profileExtra', 'forwardPe', 'annualIncome', 'annualCashFlow', 'quarterlyIncome',
  'quarterlyCashFlow', 'annualRatios', 'gradesConsensus', 'priceTargetConsensus',
  'earnings', 'dividends', 'peerRatios', 'momentum', 'segmentation',
] as const

export class CoreRaioxAssetUnavailableError extends Error {
  readonly code = 'CLAREZA_CORE_RAIOX_ASSET_UNAVAILABLE'

  constructor() {
    super('Clareza core Raio-X asset is unavailable')
    this.name = 'CoreRaioxAssetUnavailableError'
  }
}

const finite = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
)
const fraction = (value: unknown): number | null => {
  const number = finite(value)
  return number === null ? null : Number((number / 100).toFixed(12))
}

function coverage(
  complement: CoreRaioxComplementSource | null,
): Readonly<Record<typeof COMPLEMENT_KEYS[number], ComplementCoverageStatus>> {
  return Object.fromEntries(COMPLEMENT_KEYS.map(key => [
    key,
    complement === null ? 'missing' : 'available',
  ])) as Record<typeof COMPLEMENT_KEYS[number], ComplementCoverageStatus>
}

export function composeCoreRaioxPayload(
  core: CoreRaioxAssetSource | null,
  complement: CoreRaioxComplementSource | null,
  sectorPe: readonly unknown[] = [],
): Record<string, unknown> & {
  readonly generationId: string
  readonly ticker: string
  readonly evaluation: JsonRecord | null
  readonly inc: readonly unknown[]
  readonly complementCoverage: ReturnType<typeof coverage>
} {
  if (!core) throw new CoreRaioxAssetUnavailableError()
  const data = core.data
  const extra = complement?.profileExtra ?? {}
  const p = {
    companyName: core.name,
    sector: core.sector,
    industry: data.industry ?? extra.industry ?? null,
    price: finite(data.price),
    currency: data.currency ?? null,
    exchange: data.exchange ?? null,
    exchangeShortName: data.exchange ?? null,
    changesPercentage: finite(data.change),
    changePercentage: finite(data.change),
    marketCap: finite(data.marketCap),
    mktCap: finite(data.marketCap),
    ceo: extra.ceo ?? null,
    fullTimeEmployees: extra.fullTimeEmployees ?? null,
    country: extra.country ?? null,
  }
  const r = {
    priceToEarningsRatioTTM: finite(data.pe),
    priceToBookRatioTTM: finite(data.pb),
    priceToSalesRatioTTM: finite(data.ps),
    forwardPriceToEarningsGrowthRatioTTM: finite(data.peg),
    grossProfitMarginTTM: fraction(data.grossMarginTTM),
    netProfitMarginTTM: fraction(data.netMargin),
    returnOnEquityTTM: fraction(data.roe),
    dividendYieldTTM: fraction(data.dividendYield),
    dividendPayoutRatioTTM: fraction(data.payoutRatio),
    debtToEquityRatioTTM: finite(data.debtEquity),
    enterpriseValueMultipleTTM: finite(data.evEbitda),
    forwardPriceToEarningsRatioTTM: complement?.forwardPe ?? null,
  }
  const km = {
    evToEBITDATTM: finite(data.evEbitda),
    netDebtToEBITDATTM: finite(data.debtEbitda),
    debtToEquityTTM: finite(data.debtEquity),
    returnOnEquityTTM: fraction(data.roe),
    returnOnInvestedCapitalTTM: fraction(data.roic),
    freeCashFlowYieldTTM: fraction(data.fcfYield),
    interestCoverageTTM: finite(data.interestCoverage),
  }
  return {
    generationId: core.generationId,
    ticker: core.ticker.trim().toUpperCase(),
    p, r, km,
    inc: complement?.annualIncome ?? [],
    cf: complement?.annualCashFlow ?? [],
    incQ: complement?.quarterlyIncome ?? [],
    cfQ: complement?.quarterlyCashFlow ?? [],
    ra: complement?.annualRatios ?? [],
    gr: complement?.gradesConsensus ?? {},
    pt: complement?.priceTargetConsensus ?? {},
    ea: complement?.earnings ?? [],
    dv: complement?.dividends ?? [],
    pr: complement?.peerRatios ?? {},
    mo: complement?.momentum ?? null,
    seg: complement?.segmentation ?? [],
    dcf: { dcf: finite(data.dcf) },
    evaluation: core.evaluation ? { ...core.evaluation } : null,
    sectorPe: [...sectorPe],
    companion_updated: complement?.updated ?? null,
    complementCoverage: coverage(complement),
  }
}
