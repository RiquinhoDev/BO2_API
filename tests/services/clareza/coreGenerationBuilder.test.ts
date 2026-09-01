import { CoreGenerationBuilder } from '../../../src/services/clareza/core/coreGenerationBuilder'
import type { CoreMasterReport } from '../../../src/services/clareza/core/coreMasterCollector'
import { evaluateCoreAsset } from '../../../src/services/clareza/core/coreAssetEvaluation'
import { CLAREZA_UNIVERSE } from '../../../src/services/clareza/universe/clarezaUniverse.catalog'
import type { ClarezaAsset } from '../../../src/services/clareza/universe/clarezaUniverse.types'

const data = (evEbitda = 12) => ({
  price: 100, change: 1, perf12m: 5, pe: 20, evEbitda,
  fcfYield: 8, epsCagr: 20, roic: 18, netMargin: 20,
  grossMarginTTM: 60, debtEbitda: 1.5, interestCoverage: 10,
  marginStability: 80, fcfConversion: 100,
  dividendYield: 0, currency: 'USD', exchange: 'NASDAQ',
  updated: '2026-09-01T12:00:00.000Z',
})

function master(universe: readonly ClarezaAsset[]): CoreMasterReport {
  const records = universe.map(asset => ({ asset, status: 'available' as const, data: data() }))
  const count = (kind: ClarezaAsset['kind']) => universe.filter(asset => asset.kind === kind).length
  return {
    records,
    coverage: {
      total: universe.length, available: universe.length, missing: 0, failed: 0,
      byKind: {
        stock: { total: count('stock'), available: count('stock'), missing: 0, failed: 0 },
        fund: { total: count('fund'), available: count('fund'), missing: 0, failed: 0 },
        crypto: { total: count('crypto'), available: count('crypto'), missing: 0, failed: 0 },
      },
    },
  }
}

describe('canonical core generation builder', () => {
  it('builds 879 immutable records and scores every stock against one full-run context', () => {
    const evaluator = jest.fn(evaluateCoreAsset)
    const result = new CoreGenerationBuilder(evaluator).build({
      master: master(CLAREZA_UNIVERSE),
      now: new Date('2026-09-01T14:00:00.000Z'),
      universeVersion: 'sha256:universe',
    })

    expect(result.candidate.records).toHaveLength(879)
    expect(result.candidate.records.map(record => record.ticker))
      .toEqual(CLAREZA_UNIVERSE.map(asset => asset.ticker))
    expect(evaluator).toHaveBeenCalledTimes(347)
    expect(evaluator.mock.calls[0][1].groups).not.toEqual({})
    expect(result.report).toMatchObject({
      totalAssets: 879,
      datasets: { data: { successfulAssets: 879, failedAssets: 0 } },
      scoredAssets: 347,
      failedScoringAssets: 0,
    })
    expect(result.candidate.dataVersion).toMatch(/^core-sha256:[a-f0-9]{64}$/)
    expect(result.candidate.generationId).toMatch(/^core-20260901T140000000Z-[a-f0-9]{12}$/)
    expect(result.candidate.records.find(record => record.kind === 'fund')?.datasets.evaluation).toBeNull()
  })

  it('adds one shared-universe percentile pass after all stock evaluations', () => {
    const universe = [10, 12, 14, 16, 18].map((evEbitda, index): ClarezaAsset => ({
      ticker: `S${index}`, name: `Stock ${index}`, kind: 'stock', type: 'growth',
      bucket: 'growth', sector: 'Technology',
    }))
    const report = master(universe)
    report.records.forEach((record, index) => {
      if (record.status === 'available') Object.assign(record.data, data(10 + index * 2))
    })

    const result = new CoreGenerationBuilder().build({
      master: report, now: new Date('2026-09-01T14:00:00.000Z'), universeVersion: 'u',
    })
    const evaluations = result.candidate.records.map(record => record.datasets.evaluation as {
      valuation: { percentile?: number; topPercent?: number; pillars: readonly { key: string }[] }
      quality: { percentile?: number; topPercent?: number }
    })

    expect(evaluations.every(evaluation => evaluation.valuation.pillars.some(pillar => pillar.key === 'sector'))).toBe(true)
    expect(evaluations.every(evaluation => evaluation.valuation.percentile !== undefined)).toBe(true)
    expect(evaluations.every(evaluation => evaluation.quality.percentile !== undefined)).toBe(true)
  })

  it('keeps a failed score explicit and never publishes inside the builder', () => {
    const universe = CLAREZA_UNIVERSE.slice(0, 2)
    const evaluator = jest.fn((input, context) => {
      if (input.ticker === universe[1].ticker) throw new Error('bad score')
      return evaluateCoreAsset(input, context)
    })
    const result = new CoreGenerationBuilder(evaluator).build({
      master: master(universe), now: new Date('2026-09-01T14:00:00.000Z'), universeVersion: 'u',
    })

    expect(result.candidate.records[1].datasets.evaluation).toBeNull()
    expect(result.report).toMatchObject({ scoredAssets: 1, failedScoringAssets: 1 })
  })
})
