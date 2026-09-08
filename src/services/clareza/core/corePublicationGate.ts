import type { PublicationResult } from './coreGeneration.types'

export interface CorePublicationPolicy {
  readonly requiredDatasets: readonly string[]
  readonly minimumDatasetCoverage: Readonly<Record<string, number>>
  readonly minimumScoringCoverage: number
  readonly maximumScoringFailures: number
  readonly maximumAgeMs: number
}

export interface CoreDatasetReport {
  readonly successfulAssets: number
  readonly failedAssets: number
}

export interface CoreCandidateReport {
  readonly generationId: string
  readonly createdAt: Date
  readonly totalAssets: number
  readonly datasets: Readonly<Record<string, CoreDatasetReport>>
  readonly scoredAssets: number
  readonly failedScoringAssets: number
}

export interface CoreCandidateDecision {
  readonly eligible: boolean
  readonly reasonCodes: readonly string[]
}

export interface CoreGenerationPublisher {
  publishCandidate(
    generationId: string,
    expectedCurrentGenerationId: string | null,
  ): Promise<PublicationResult>
}

export type CoreExecutionMode = 'preview' | 'publish'

export interface ExecutePublicationGateInput {
  readonly report: CoreCandidateReport
  readonly policy: CorePublicationPolicy
  readonly now: Date
  readonly mode: CoreExecutionMode
  readonly expectedCurrentGenerationId: string | null
  readonly publisher: CoreGenerationPublisher
}

export interface CorePublicationGateResult extends CoreCandidateDecision {
  readonly status: 'rejected' | 'preview' | 'published' | 'conflict' | 'missing'
  readonly wouldPublish: boolean
  readonly published: boolean
}

function isCoverage(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

function validatePolicy(policy: CorePublicationPolicy): void {
  if (!policy.requiredDatasets.length || new Set(policy.requiredDatasets).size !== policy.requiredDatasets.length) {
    throw new RangeError('publication policy requires unique datasets')
  }
  for (const dataset of policy.requiredDatasets) {
    if (!isCoverage(policy.minimumDatasetCoverage[dataset])) {
      throw new RangeError(`publication policy coverage missing for ${dataset}`)
    }
  }
  if (!isCoverage(policy.minimumScoringCoverage)) {
    throw new RangeError('publication scoring coverage must be between 0 and 1')
  }
  if (!Number.isInteger(policy.maximumScoringFailures) || policy.maximumScoringFailures < 0) {
    throw new RangeError('publication scoring failure limit must be a non-negative integer')
  }
  if (!Number.isInteger(policy.maximumAgeMs) || policy.maximumAgeMs < 1_000) {
    throw new RangeError('publication maximum age must be at least 1000 milliseconds')
  }
}

export function validateCoreCandidate(
  report: CoreCandidateReport,
  policy: CorePublicationPolicy,
  now: Date,
): CoreCandidateDecision {
  validatePolicy(policy)
  const reasons: string[] = []
  const datasetCountsValid = Object.values(report.datasets).every(result => (
    isCount(result.successfulAssets)
    && isCount(result.failedAssets)
    && result.successfulAssets + result.failedAssets <= report.totalAssets
  ))
  const countsValid = isCount(report.totalAssets)
    && isCount(report.scoredAssets)
    && isCount(report.failedScoringAssets)
    && report.scoredAssets + report.failedScoringAssets <= report.totalAssets
    && datasetCountsValid
  if (!countsValid) {
    reasons.push('candidate-counts-invalid')
  } else if (report.totalAssets === 0) {
    reasons.push('candidate-empty')
  } else {
    for (const dataset of policy.requiredDatasets) {
      const result = report.datasets[dataset]
      if (!result) {
        reasons.push(`dataset-missing:${dataset}`)
        continue
      }
      if (result.successfulAssets / report.totalAssets < policy.minimumDatasetCoverage[dataset]) {
        reasons.push(`dataset-coverage:${dataset}`)
      }
    }
    if (report.scoredAssets / report.totalAssets < policy.minimumScoringCoverage) {
      reasons.push('scoring-coverage')
    }
    if (report.failedScoringAssets > policy.maximumScoringFailures) {
      reasons.push('scoring-failures')
    }
  }
  const age = now.getTime() - report.createdAt.getTime()
  if (!Number.isFinite(age) || age < 0 || age > policy.maximumAgeMs) reasons.push('candidate-stale')
  return { eligible: reasons.length === 0, reasonCodes: reasons }
}

export async function executePublicationGate(
  input: ExecutePublicationGateInput,
): Promise<CorePublicationGateResult> {
  const decision = validateCoreCandidate(input.report, input.policy, input.now)
  if (!decision.eligible) {
    return { ...decision, status: 'rejected', wouldPublish: false, published: false }
  }
  if (input.mode === 'preview') {
    return { ...decision, status: 'preview', wouldPublish: true, published: false }
  }
  const result = await input.publisher.publishCandidate(
    input.report.generationId,
    input.expectedCurrentGenerationId,
  )
  return {
    ...decision,
    status: result.status,
    wouldPublish: true,
    published: result.status === 'published',
  }
}
