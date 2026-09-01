import { createHash } from 'node:crypto'

import {
  evaluateCoreAsset,
  type CoreEvaluationInput,
} from './coreAssetEvaluation'
import { buildSectorContext, percentileRank, type SectorContext } from './coreEvaluationContext'
import type { CoreGenerationCandidate } from './coreGeneration.types'
import type { CoreMasterRecord, CoreMasterReport } from './coreMasterCollector'
import type { CoreCandidateReport } from './corePublicationGate'

type CoreEvaluation = ReturnType<typeof evaluateCoreAsset>
export type CoreAssetEvaluator = (
  input: CoreEvaluationInput,
  context: SectorContext,
) => CoreEvaluation

export interface BuildCoreGenerationInput {
  readonly master: CoreMasterReport
  readonly now: Date
  readonly universeVersion: string
}

export interface CoreGenerationBuildResult {
  readonly candidate: CoreGenerationCandidate
  readonly report: CoreCandidateReport
}

function numericScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function addPercentiles(
  evaluation: CoreEvaluation,
  valuationScores: readonly number[],
  qualityScores: readonly number[],
): CoreEvaluation {
  const valuationScore = numericScore(evaluation.valuation.score)
  const qualityScore = numericScore(evaluation.quality.score)
  const valuationRank = valuationScore === null ? null : percentileRank(valuationScore, valuationScores)
  const qualityRank = qualityScore === null ? null : percentileRank(qualityScore, qualityScores)
  return {
    ...evaluation,
    valuation: {
      ...evaluation.valuation,
      ...(valuationRank === null ? {} : {
        percentile: Math.round(valuationRank),
        topPercent: Math.max(1, Math.round(100 - valuationRank)),
      }),
    },
    quality: {
      ...evaluation.quality,
      ...(qualityRank === null ? {} : {
        percentile: Math.round(qualityRank),
        topPercent: Math.max(1, Math.round(100 - qualityRank)),
      }),
    },
  }
}

export class CoreGenerationBuilder {
  constructor(private readonly evaluator: CoreAssetEvaluator = evaluateCoreAsset) {}

  build(input: BuildCoreGenerationInput): CoreGenerationBuildResult {
    if (Number.isNaN(input.now.getTime())) throw new RangeError('core generation timestamp is invalid')
    if (!input.universeVersion.trim()) throw new RangeError('core universe version is required')
    if (input.master.records.length !== input.master.coverage.total) {
      throw new RangeError('core master coverage does not match its records')
    }
    const tickers = input.master.records.map(record => record.asset.ticker.trim().toUpperCase())
    if (tickers.some(ticker => !ticker) || new Set(tickers).size !== tickers.length) {
      throw new RangeError('core master records require unique tickers')
    }

    const context = buildSectorContext(input.master.records
      .filter((record): record is Extract<CoreMasterRecord, { status: 'available' }> => (
        record.status === 'available' && record.asset.kind === 'stock'
      ))
      .map(record => ({
        ticker: record.asset.ticker,
        sector: record.asset.sector,
        bucket: record.asset.bucket,
        metrics: {
          pe: record.data.pe,
          ps: record.data.ps,
          pb: record.data.pb,
          evEbitda: record.data.evEbitda,
          pFfo: record.data.pFfo,
        },
      })))

    let failedScoringAssets = 0
    const evaluations = input.master.records.map((record): CoreEvaluation | null => {
      if (record.status !== 'available' || record.asset.kind !== 'stock') return null
      try {
        return this.evaluator({
          ticker: record.asset.ticker,
          bucket: record.asset.bucket,
          sector: record.asset.sector,
          data: { ...record.data },
        }, context)
      } catch {
        failedScoringAssets += 1
        return null
      }
    })
    const valuationScores = evaluations.flatMap(evaluation => {
      const score = numericScore(evaluation?.valuation.score)
      return score === null ? [] : [score]
    })
    const qualityScores = evaluations.flatMap(evaluation => {
      const score = numericScore(evaluation?.quality.score)
      return score === null ? [] : [score]
    })
    const rankedEvaluations = evaluations.map(evaluation => (
      evaluation ? addPercentiles(evaluation, valuationScores, qualityScores) : null
    ))
    const records = input.master.records.map((record, index) => ({
      ticker: record.asset.ticker.trim().toUpperCase(),
      kind: record.asset.kind,
      datasets: {
        data: record.status === 'available' ? { ...record.data } : null,
        evaluation: rankedEvaluations[index],
      },
    }))
    const hash = createHash('sha256').update(JSON.stringify({
      records,
      coverage: input.master.coverage,
    })).digest('hex')
    const timestamp = input.now.toISOString().replace(/[-:.]/g, '')
    const generationId = `core-${timestamp}-${hash.slice(0, 12)}`
    const candidate: CoreGenerationCandidate = {
      generationId,
      universeVersion: input.universeVersion,
      dataVersion: `core-sha256:${hash}`,
      createdAt: input.now,
      records,
    }
    const report: CoreCandidateReport = {
      generationId,
      createdAt: input.now,
      totalAssets: records.length,
      datasets: {
        data: {
          successfulAssets: input.master.coverage.available,
          failedAssets: input.master.coverage.missing + input.master.coverage.failed,
        },
      },
      scoredAssets: evaluations.filter(evaluation => evaluation !== null).length,
      failedScoringAssets,
    }
    return { candidate, report }
  }
}
