import {
  radarRank,
  resolveSectorMedian,
  type SectorContext,
  type ValuationMetric,
} from './coreEvaluationContext'
import { buildCoreVerdict, qualityStyle, valuationStyle } from './coreQualityVerdict'
import { aggregateValuation, interpolateScore, type ValuationPillarKey } from './coreValuation'

type JsonRecord = Readonly<Record<string, unknown>>
type CoreEvaluationBucket = 'growth' | 'value' | 'reit' | 'financials'

interface CoreEvaluationInput {
  readonly ticker: string
  readonly bucket: string
  readonly sector: string
  readonly data: JsonRecord
}

interface EvaluationPillar {
  readonly key: ValuationPillarKey
  readonly label: string
  readonly score: number
  readonly detail: string
}

interface QualityPart {
  readonly key: 'rent' | 'cresc' | 'saude' | 'cons'
  readonly label: string
  readonly weight: number
  readonly score: number
  readonly metrics: readonly unknown[]
}

const PREMIUM_SCALE = [[-0.5, 95], [-0.3, 85], [-0.15, 68], [-0.05, 55], [0.05, 45], [0.15, 32], [0.3, 18], [0.6, 6]] as const
const PEG_SCALE = [[0.5, 93], [1, 80], [1.5, 62], [2, 48], [2.5, 35], [3.5, 16], [5, 5]] as const
const MOS_SCALE = [[-0.45, 3], [-0.3, 12], [-0.15, 28], [-0.05, 42], [0.05, 58], [0.15, 70], [0.3, 84], [0.5, 94]] as const
const FCFY_SCALE = [[1, 8], [3, 28], [4.5, 45], [6, 62], [8, 78], [12, 92]] as const
const EY_SCALE = [[3, 10], [5, 32], [7, 52], [9, 70], [12, 86], [16, 95]] as const

const number = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
)

const average = (values: readonly (number | null)[]): number | null => {
  const present = values.filter((value): value is number => value !== null && Number.isFinite(value))
  return present.length ? present.reduce((total, value) => total + value, 0) / present.length : null
}

function bucket(value: string): CoreEvaluationBucket {
  return ['growth', 'reit', 'financials'].includes(value) ? value as CoreEvaluationBucket : 'value'
}

function primaryMultiple(value: CoreEvaluationBucket, data: JsonRecord): { key: ValuationMetric; label: string; value: number } | null {
  const candidates: readonly [ValuationMetric, string][] = value === 'reit'
    ? [['pFfo', 'P/FFO']]
    : value === 'financials'
      ? [['pb', 'P/B'], ['pe', 'P/E']]
      : value === 'growth'
        ? [['evEbitda', 'EV/EBITDA'], ['ps', 'P/S']]
        : [['pe', 'P/E'], ['evEbitda', 'EV/EBITDA']]
  for (const [key, label] of candidates) {
    const metric = number(data[key])
    if (metric !== null && metric > 0 && metric < 200) return { key, label, value: metric }
  }
  return null
}

function valuationPillars(input: CoreEvaluationInput, context: SectorContext): readonly EvaluationPillar[] {
  const value = bucket(input.bucket)
  const multiple = primaryMultiple(value, input.data)
  const pillars: EvaluationPillar[] = []
  const histMedians = typeof input.data.histMedians === 'object' && input.data.histMedians !== null
    ? input.data.histMedians as JsonRecord : {}
  const historical = multiple ? number(histMedians[multiple.key]) : null
  if (multiple && historical !== null && historical > 0) {
    const premium = multiple.value / historical - 1
    const score = interpolateScore(premium, PREMIUM_SCALE)
    if (score !== null) pillars.push({ key: 'history', label: 'Face à própria história', score, detail: `${multiple.label} vs mediana histórica` })
  }
  if (multiple) {
    const median = resolveSectorMedian(context, input.sector, value, multiple.key)
    if (median) {
      const score = interpolateScore(multiple.value / median.value - 1, PREMIUM_SCALE)
      if (score !== null) pillars.push({ key: 'sector', label: 'Face ao setor', score, detail: `${multiple.label} vs mediana setorial` })
    }
  }
  if (value !== 'reit') {
    const pe = number(input.data.pe)
    const growth = number(input.data.epsCagr)
    if (pe !== null && pe > 0 && growth !== null && growth > 1) {
      const peg = pe / growth
      const score = interpolateScore(peg, PEG_SCALE)
      if (score !== null) pillars.push({ key: 'peg', label: 'Múltiplo vs crescimento', score, detail: `PEG calculado ${peg.toFixed(2)}` })
    }
  }
  const price = number(input.data.price)
  const dcf = number(input.data.dcf)
  let intrinsic: number | null
  let detail: string
  if (price !== null && price > 0 && dcf !== null && dcf > 0) {
    intrinsic = interpolateScore((dcf - price) / price, MOS_SCALE)
    detail = 'Preço vs valor intrínseco DCF'
  } else if (value === 'financials') {
    const pe = number(input.data.pe)
    intrinsic = pe !== null && pe > 0 ? interpolateScore(100 / pe, EY_SCALE) : null
    detail = 'Rendimento dos lucros'
  } else {
    const yieldValue = number(input.data.fcfYield) ?? (value === 'reit' ? number(input.data.ffoYield) : null)
    intrinsic = yieldValue !== null && yieldValue > 0 ? interpolateScore(yieldValue, FCFY_SCALE) : null
    detail = value === 'reit' && input.data.fcfYield === undefined ? 'Rendimento do FFO' : 'Rendimento do fluxo de caixa'
  }
  if (intrinsic !== null) pillars.push({ key: 'intrinsic', label: detail, score: intrinsic, detail })
  return pillars
}

function qualityParts(value: CoreEvaluationBucket, data: JsonRecord): readonly QualityPart[] {
  const parts: QualityPart[] = []
  const profitability = average([
    value === 'financials'
      ? interpolateScore(number(data.roe) ?? Number.NaN, [[0, 8], [8, 32], [15, 55], [25, 78], [40, 92]])
      : interpolateScore(number(data.roic) ?? Number.NaN, [[0, 8], [6, 30], [10, 52], [18, 75], [30, 92]]),
    interpolateScore(number(data.netMargin) ?? Number.NaN, [[0, 8], [6, 32], [12, 52], [20, 75], [30, 92]]),
    value !== 'financials'
      ? interpolateScore(number(data.grossMarginTTM) ?? Number.NaN, [[15, 15], [25, 35], [40, 55], [60, 78], [75, 90]])
      : null,
  ])
  if (profitability !== null) parts.push({ key: 'rent', label: 'Rentabilidade', weight: 0.3, score: profitability, metrics: [] })

  const cagr = average([
    interpolateScore(number(data.revenueCagr) ?? Number.NaN, [[-10, 5], [0, 25], [5, 45], [12, 68], [25, 88], [40, 95]]),
    interpolateScore(number(data.epsCagr) ?? Number.NaN, [[-10, 5], [0, 25], [6, 45], [15, 70], [30, 90], [50, 96]]),
  ])
  const recent = average([
    interpolateScore(number(data.revenueYoY) ?? Number.NaN, [[-25, 3], [-10, 15], [0, 35], [8, 58], [20, 80], [40, 92], [60, 96]]),
    interpolateScore(number(data.epsYoY) ?? Number.NaN, [[-40, 3], [-15, 18], [0, 35], [10, 58], [30, 80], [60, 92], [100, 96]]),
  ])
  const growth = cagr !== null && recent !== null ? 0.6 * cagr + 0.4 * recent : cagr ?? recent
  if (growth !== null) parts.push({ key: 'cresc', label: 'Crescimento', weight: 0.25, score: growth, metrics: [] })

  const health = value === 'financials'
    ? average([interpolateScore(number(data.payoutRatio) ?? Number.NaN, [[20, 85], [40, 75], [60, 58], [80, 35], [100, 12]])])
    : average([
      interpolateScore(number(data.debtEbitda) ?? Number.NaN, value === 'reit'
        ? [[0, 92], [4, 78], [6, 55], [9, 25], [13, 8]]
        : [[-1, 95], [0, 90], [1.5, 75], [2.5, 55], [4, 30], [6, 10]]),
      interpolateScore(number(data.interestCoverage) ?? Number.NaN, [[-2, 5], [0, 10], [1.5, 25], [3, 50], [6, 72], [10, 88], [20, 95]]),
    ])
  if (health !== null) parts.push({ key: 'saude', label: 'Saúde do balanço', weight: 0.25, score: health, metrics: [] })

  const consistency = average([
    number(data.marginStability) === null ? null : Math.max(0, Math.min(100, number(data.marginStability)!)),
    interpolateScore(number(data.fcfConversion) ?? Number.NaN, [[0, 10], [50, 25], [80, 50], [100, 68], [130, 85], [180, 93]]),
  ])
  if (consistency !== null) parts.push({ key: 'cons', label: 'Consistência', weight: 0.2, score: consistency, metrics: [] })

  const totalWeight = parts.reduce((total, part) => total + part.weight, 0)
  return totalWeight === 0 ? [] : parts.map(part => ({ ...part, weight: part.weight / totalWeight }))
}

export function evaluateCoreAsset(input: CoreEvaluationInput, context: SectorContext) {
  const value = bucket(input.bucket)
  const sourcePillars = valuationPillars(input, context)
  const valuation = aggregateValuation(sourcePillars)
  const weightedPillars = valuation.pillars.map(weighted => ({
    ...sourcePillars.find(pillar => pillar.key === weighted.key)!,
    weight: weighted.weight,
  }))
  const parts = qualityParts(value, input.data)
  const qualityScore = parts.length
    ? Math.round(parts.reduce((total, part) => total + part.score * part.weight, 0))
    : null
  const valuationAppearance = valuationStyle(valuation.score)
  const qualityAppearance = qualityStyle(qualityScore)
  const verdict = buildCoreVerdict(valuation.score, qualityScore, valuation.lowConfidence)
  return {
    ticker: input.ticker,
    bucket: value,
    multiple: primaryMultiple(value, input.data),
    valuation: {
      score: valuation.score,
      rawScore: valuation.score,
      label: valuationAppearance.label,
      color: valuationAppearance.color,
      cls: valuationAppearance.className,
      pillars: weightedPillars,
      coverage: valuation.coverage,
      lowConfidence: valuation.lowConfidence,
      divergence: null,
    },
    quality: {
      score: qualityScore,
      label: qualityAppearance.label,
      color: qualityAppearance.color,
      parts,
    },
    radarRank: radarRank(verdict.key, valuation.score, qualityScore),
    verdict,
  }
}
