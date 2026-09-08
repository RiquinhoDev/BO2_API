export type ValuationPillarKey = 'history' | 'sector' | 'peg' | 'intrinsic'

export interface ValuationPillarInput {
  readonly key: ValuationPillarKey
  readonly score: number | null
}

export interface WeightedValuationPillar {
  readonly key: ValuationPillarKey
  readonly score: number
  readonly weight: number
}

export interface AggregatedValuation {
  readonly score: number | null
  readonly rawUnshrunk: number | null
  readonly pillars: readonly WeightedValuationPillar[]
  readonly coverage: number
  readonly lowConfidence: boolean
}

const BASE_WEIGHTS: Readonly<Record<ValuationPillarKey, number>> = {
  history: 0.35,
  sector: 0.25,
  peg: 0.2,
  intrinsic: 0.2,
}

const clamp = (value: number, low: number, high: number): number => (
  Math.max(low, Math.min(high, value))
)

export function interpolateScore(
  value: number,
  anchors: readonly (readonly [number, number])[],
): number | null {
  if (!Number.isFinite(value) || anchors.length === 0) return null
  for (let index = 1; index < anchors.length; index += 1) {
    if (anchors[index][0] <= anchors[index - 1][0]) {
      throw new RangeError('score anchors must be strictly increasing')
    }
  }
  if (value <= anchors[0][0]) return anchors[0][1]
  const last = anchors[anchors.length - 1]
  if (value >= last[0]) return last[1]
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const left = anchors[index]
    const right = anchors[index + 1]
    if (value <= right[0]) {
      const position = (value - left[0]) / (right[0] - left[0])
      return left[1] + (right[1] - left[1]) * position
    }
  }
  return null
}

export function medianFinite(values: readonly (number | null)[]): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((left, right) => left - right)
  if (!finite.length) return null
  const middle = Math.floor(finite.length / 2)
  return finite.length % 2 ? finite[middle] : (finite[middle - 1] + finite[middle]) / 2
}

export function aggregateValuation(
  pillars: readonly ValuationPillarInput[],
): AggregatedValuation {
  const present = pillars.filter((pillar): pillar is { key: ValuationPillarKey; score: number } => (
    pillar.score !== null && Number.isFinite(pillar.score)
  ))
  const coverage = present.reduce((total, pillar) => total + BASE_WEIGHTS[pillar.key], 0)
  if (coverage === 0) {
    return { score: null, rawUnshrunk: null, pillars: [], coverage: 0, lowConfidence: true }
  }
  const weighted = present.map(pillar => ({
    ...pillar,
    weight: BASE_WEIGHTS[pillar.key] / coverage,
  }))
  const raw = clamp(weighted.reduce((total, pillar) => total + pillar.score * pillar.weight, 0), 0, 100)
  const lowConfidence = coverage < 0.6
  const score = lowConfidence ? 50 + (raw - 50) * (coverage / 0.6) : raw
  return {
    score: Math.round(score),
    rawUnshrunk: Math.round(raw),
    pillars: weighted,
    coverage,
    lowConfidence,
  }
}
