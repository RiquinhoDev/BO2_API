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

export interface CoreEvaluationInput {
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
  readonly metrics: readonly JsonRecord[]
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
const BASE_WEIGHTS: Readonly<Record<ValuationPillarKey, number>> = {
  history: 0.35, sector: 0.25, peg: 0.2, intrinsic: 0.2,
}

const fixed = (value: number, digits: number): string => value.toFixed(digits)
const signed = (value: number, digits: number): string => `${value >= 0 ? '+' : ''}${fixed(value, digits)}`
const percent = (value: number, digits = 1): string => `${fixed(value, digits)}%`

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
    const capped = key === 'evEbitda'
    if (metric !== null && metric > 0 && (!capped || metric < 200)) return { key, label, value: metric }
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
    if (score !== null) pillars.push({
      key: 'history', label: 'Face à própria história', score,
      detail: `${multiple.label} de ${fixed(multiple.value, 1)}x vs mediana de 5 anos de ${fixed(historical, 1)}x (${signed(premium * 100, 0)}%)`,
      metrics: [
        { label: `${multiple.label} atual`, value: `${fixed(multiple.value, 1)}x` },
        { label: 'Mediana de 5 anos', value: `${fixed(historical, 1)}x` },
        { label: 'Diferença', value: `${signed(premium * 100, 0)}%`, highlight: true },
      ],
    })
  }
  if (multiple) {
    const median = resolveSectorMedian(context, input.sector, value, multiple.key)
    if (median) {
      const score = interpolateScore(multiple.value / median.value - 1, PREMIUM_SCALE)
      if (score !== null) {
        const premium = multiple.value / median.value - 1
        const scope = median.source === 'sector-bucket'
          ? `de pares ${value === 'growth' ? 'crescimento' : value === 'value' ? 'valor' : value === 'financials' ? 'financeiro' : 'REIT'} do setor ${input.sector}`
          : `do setor ${input.sector}`
        pillars.push({
          key: 'sector', label: 'Face ao setor', score,
          detail: `${multiple.label} de ${fixed(multiple.value, 1)}x vs mediana ${scope} de ${fixed(median.value, 1)}x (${signed(premium * 100, 0)}%)`,
          metrics: [
            { label: `${multiple.label} atual`, value: `${fixed(multiple.value, 1)}x` },
            { label: median.source === 'sector-bucket' ? `Mediana de pares - ${input.sector}` : `Mediana do setor - ${input.sector}`, value: `${fixed(median.value, 1)}x` },
            { label: 'Diferença', value: `${signed(premium * 100, 0)}%`, highlight: true },
          ],
        })
      }
    }
  }
  if (value !== 'reit') {
    const pe = number(input.data.pe)
    const growth = number(input.data.epsCagr)
    if (pe !== null && pe > 0 && growth !== null && growth > 1) {
      const peg = pe / growth
      const score = interpolateScore(peg, PEG_SCALE)
      if (score !== null) pillars.push({
        key: 'peg', label: 'Múltiplo vs crescimento', score,
        detail: `PEG de ${fixed(peg, 2)} (P/E ${fixed(pe, 1)}x ÷ crescimento do lucro de ${fixed(growth, 0)}%/ano)`,
        metrics: [
          { label: 'P/E', value: `${fixed(pe, 1)}x` },
          { label: 'Crescimento do lucro', value: `${fixed(growth, 0)}%/ano` },
          { label: 'PEG', value: fixed(peg, 2), highlight: true },
        ],
      })
    }
  }
  const price = number(input.data.price)
  const dcf = number(input.data.dcf)
  let intrinsic: number | null = null
  let label = ''
  let detail = ''
  let metrics: JsonRecord[] = []
  if (price !== null && price > 0 && dcf !== null && dcf > 0) {
    intrinsic = interpolateScore((dcf - price) / price, MOS_SCALE)
    const margin = (dcf - price) / price
    label = 'Valor intrínseco (Modelo DCF)'
    detail = `Valor intrínseco estimado de ${fixed(dcf, 2)} vs preço de ${fixed(price, 2)} (margem de segurança ${signed(margin * 100, 0)}%)`
    metrics = [
      { label: 'Valor intrínseco', value: fixed(dcf, 2) },
      { label: 'Preço atual', value: fixed(price, 2) },
      { label: 'Margem de segurança', value: `${signed(margin * 100, 0)}%`, highlight: true },
    ]
  } else if (value === 'financials') {
    const pe = number(input.data.pe)
    intrinsic = pe !== null && pe > 0 ? interpolateScore(100 / pe, EY_SCALE) : null
    label = 'Rendimento dos lucros'
    detail = 'Rendimento dos lucros'
    if (pe !== null && pe > 0) metrics = [
      { label: 'P/E', value: `${fixed(pe, 1)}x` },
      { label: 'Earnings yield', value: percent(100 / pe), highlight: true },
    ]
  } else {
    const fcfYield = number(input.data.fcfYield)
    const ffoYield = value === 'reit' ? number(input.data.ffoYield) : null
    const yieldValue = fcfYield !== null && fcfYield > 0 ? fcfYield : ffoYield
    intrinsic = yieldValue !== null && yieldValue > 0 ? interpolateScore(yieldValue, FCFY_SCALE) : null
    const usesFfo = !(fcfYield !== null && fcfYield > 0) && ffoYield !== null && ffoYield > 0
    label = usesFfo ? 'Rendimento do FFO' : 'Rendimento do fluxo de caixa'
    detail = usesFfo ? `FFO yield de ${fixed(yieldValue ?? 0, 1)}%` : `FCF yield de ${fixed(yieldValue ?? 0, 1)}% (sem DCF fiável disponível)`
    if (yieldValue !== null && yieldValue > 0) metrics = [{
      label: usesFfo ? 'FFO yield' : 'FCF yield', value: percent(yieldValue), highlight: true,
    }]
  }
  if (intrinsic !== null) pillars.push({ key: 'intrinsic', label, score: intrinsic, detail, metrics })
  return pillars
}

function qualityParts(value: CoreEvaluationBucket, data: JsonRecord): readonly QualityPart[] {
  const parts: QualityPart[] = []
  const roe = number(data.roe)
  const roic = number(data.roic)
  const netMargin = number(data.netMargin)
  const grossMargin = number(data.grossMarginTTM)
  const profitability = average([
    value === 'financials'
      ? interpolateScore(roe ?? Number.NaN, [[0, 8], [8, 32], [15, 55], [25, 78], [40, 92]])
      : interpolateScore(roic ?? Number.NaN, [[0, 8], [6, 30], [10, 52], [18, 75], [30, 92]]),
    interpolateScore(netMargin ?? Number.NaN, [[0, 8], [6, 32], [12, 52], [20, 75], [30, 92]]),
    value !== 'financials'
      ? interpolateScore(grossMargin ?? Number.NaN, [[15, 15], [25, 35], [40, 55], [60, 78], [75, 90]])
      : null,
  ])
  if (profitability !== null) parts.push({
    key: 'rent', label: 'Rentabilidade', weight: 0.3, score: profitability,
    metrics: [
      ...(value === 'financials' && roe !== null ? [{ label: 'ROE', value: percent(roe) }] : []),
      ...(value !== 'financials' && roic !== null ? [{ label: 'ROIC', value: percent(roic) }] : []),
      ...(netMargin !== null ? [{ label: 'Margem líquida', value: percent(netMargin) }] : []),
      ...(grossMargin !== null && value !== 'financials' ? [{ label: 'Margem bruta', value: percent(grossMargin) }] : []),
    ],
  })

  const revenueCagr = number(data.revenueCagr)
  const epsCagr = number(data.epsCagr)
  const revenueYoY = number(data.revenueYoY)
  const epsYoY = number(data.epsYoY)
  const turnaround = Boolean(data.epsTurnaround)
  const cagr = average([
    interpolateScore(revenueCagr ?? Number.NaN, [[-10, 5], [0, 25], [5, 45], [12, 68], [25, 88], [40, 95]]),
    interpolateScore(epsCagr ?? Number.NaN, [[-10, 5], [0, 25], [6, 45], [15, 70], [30, 90], [50, 96]]),
  ])
  const recent = average([
    interpolateScore(revenueYoY ?? Number.NaN, [[-25, 3], [-10, 15], [0, 35], [8, 58], [20, 80], [40, 92], [60, 96]]),
    epsYoY !== null
      ? interpolateScore(epsYoY, [[-40, 3], [-15, 18], [0, 35], [10, 58], [30, 80], [60, 92], [100, 96]])
      : turnaround ? 85 : null,
  ])
  const growth = cagr !== null && recent !== null ? 0.6 * cagr + 0.4 * recent : cagr ?? recent
  if (growth !== null) {
    const years = number(data.growthYears)
    const cagrTag = years ? `CAGR ${Math.round(years)}a` : 'CAGR'
    const latestFiscalYear = typeof data.latestFiscalYear === 'string' || typeof data.latestFiscalYear === 'number'
      ? String(data.latestFiscalYear) : null
    const recentTag = latestFiscalYear ? `FY${latestFiscalYear}` : 'último ano'
    parts.push({
      key: 'cresc', label: 'Crescimento', weight: 0.25, score: growth,
      metrics: [
        ...(revenueCagr !== null ? [{ label: `Receita · ${cagrTag}`, value: `${signed(revenueCagr, 1)}%/ano` }] : []),
        ...(epsCagr !== null ? [{ label: `Lucro · ${cagrTag}`, value: `${signed(epsCagr, 1)}%/ano` }] : []),
        ...(revenueYoY !== null ? [{ label: `Receita · ${recentTag}`, value: `${signed(revenueYoY, 1)}%`, highlight: true }] : []),
        ...(epsYoY !== null
          ? [{ label: `Lucro · ${recentTag}`, value: `${signed(epsYoY, 1)}%`, highlight: true }]
          : turnaround ? [{ label: `Lucro · ${recentTag}`, value: 'Saiu de prejuízo', highlight: true }] : []),
      ],
    })
  }

  const payoutRatio = number(data.payoutRatio)
  const debtEbitda = number(data.debtEbitda)
  const interestCoverage = number(data.interestCoverage)
  const health = value === 'financials'
    ? average([payoutRatio !== null
      ? interpolateScore(payoutRatio, [[20, 85], [40, 75], [60, 58], [80, 35], [100, 12]])
      : interpolateScore(roe ?? Number.NaN, [[0, 20], [10, 55], [18, 80]])])
    : average([
      interpolateScore(debtEbitda ?? Number.NaN, value === 'reit'
        ? [[0, 92], [4, 78], [6, 55], [9, 25], [13, 8]]
        : [[-1, 95], [0, 90], [1.5, 75], [2.5, 55], [4, 30], [6, 10]]),
      interpolateScore(interestCoverage ?? Number.NaN, [[-2, 5], [0, 10], [1.5, 25], [3, 50], [6, 72], [10, 88], [20, 95]]),
    ])
  if (health !== null) parts.push({
    key: 'saude', label: 'Saúde do balanço', weight: 0.25, score: health,
    metrics: value === 'financials'
      ? payoutRatio !== null
        ? [{ label: 'Payout ratio', value: percent(payoutRatio) }]
        : roe !== null ? [{ label: 'ROE', value: percent(roe) }] : []
      : [
        ...(debtEbitda !== null ? [{ label: 'Dívida/EBITDA', value: `${fixed(debtEbitda, 1)}x` }] : []),
        ...(interestCoverage !== null ? [{ label: 'Cobertura de juros', value: `${fixed(interestCoverage, 1)}x` }] : []),
      ],
  })

  const marginStability = number(data.marginStability)
  const fcfConversion = number(data.fcfConversion)
  const consistency = average([
    marginStability === null ? null : Math.max(0, Math.min(100, marginStability)),
    interpolateScore(fcfConversion ?? Number.NaN, [[0, 10], [50, 25], [80, 50], [100, 68], [130, 85], [180, 93]]),
  ])
  if (consistency !== null) parts.push({
    key: 'cons', label: 'Consistência', weight: 0.2, score: consistency,
    metrics: [
      ...(marginStability !== null ? [{ label: 'Estabilidade da margem', value: fixed(Math.max(0, Math.min(100, marginStability)), 0) }] : []),
      ...(fcfConversion !== null ? [{ label: 'FCF/Lucro', value: `${fixed(fcfConversion, 0)}%` }] : []),
    ],
  })

  const totalWeight = parts.reduce((total, part) => total + part.weight, 0)
  return totalWeight === 0 ? [] : parts.map(part => ({ ...part, weight: part.weight / totalWeight }))
}

interface ValuationDivergence {
  readonly type: 'otimismo' | 'pessimismo'
  readonly message: string
}

function valuationDivergence(pillars: readonly EvaluationPillar[]): ValuationDivergence | null {
  const intrinsic = pillars.find(pillar => pillar.key === 'intrinsic')
  const others = pillars.filter(pillar => pillar.key !== 'intrinsic')
  const otherWeight = others.reduce((total, pillar) => total + BASE_WEIGHTS[pillar.key], 0)
  if (!intrinsic || otherWeight === 0) return null
  const otherScore = others.reduce((total, pillar) => (
    total + pillar.score * BASE_WEIGHTS[pillar.key]
  ), 0) / otherWeight
  if (intrinsic.score <= 20 && otherScore >= 65) {
    return {
      type: 'otimismo',
      message: 'Os múltiplos sugerem que a ação pode estar barata, mas o DCF aponta para um valor abaixo do preço atual. Isto é frequente em empresas com forte reinvestimento, onde o capex elevado pode pressionar temporariamente o free cash flow.',
    }
  }
  if (intrinsic.score >= 80 && otherScore <= 35) {
    return {
      type: 'pessimismo',
      message: 'Os múltiplos estão exigentes, mas o valor intrínseco estimado está acima do preço atual. Pode haver valor não refletido nos múltiplos.',
    }
  }
  return null
}

export function evaluateCoreAsset(input: CoreEvaluationInput, context: SectorContext) {
  const value = bucket(input.bucket)
  const sourcePillars = valuationPillars(input, context)
  const valuation = aggregateValuation(sourcePillars)
  const divergence = valuationDivergence(sourcePillars)
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
      divergence,
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
