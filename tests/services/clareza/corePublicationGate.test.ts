import {
  executePublicationGate,
  validateCoreCandidate,
  type CoreCandidateReport,
  type CorePublicationPolicy,
} from '../../../src/services/clareza/core/corePublicationGate'

const policy: CorePublicationPolicy = {
  requiredDatasets: ['profile', 'ratios'],
  minimumDatasetCoverage: { profile: 1, ratios: 0.8 },
  minimumScoringCoverage: 0.8,
  maximumScoringFailures: 0,
  maximumAgeMs: 3_600_000,
}

const report = (overrides: Partial<CoreCandidateReport> = {}): CoreCandidateReport => ({
  generationId: 'generation-a',
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  totalAssets: 10,
  datasets: {
    profile: { successfulAssets: 10, failedAssets: 0 },
    ratios: { successfulAssets: 8, failedAssets: 2 },
  },
  scoredAssets: 8,
  failedScoringAssets: 0,
  ...overrides,
})

const now = new Date('2026-09-01T10:30:00.000Z')

describe('core publication gate', () => {
  it('rejects missing/partial datasets, scoring failures, empty and stale candidates explicitly', () => {
    expect(validateCoreCandidate(report({ datasets: {} }), policy, now).reasonCodes)
      .toEqual(['dataset-missing:profile', 'dataset-missing:ratios'])
    expect(validateCoreCandidate(report({
      datasets: {
        profile: { successfulAssets: 10, failedAssets: 0 },
        ratios: { successfulAssets: 7, failedAssets: 3 },
      },
    }), policy, now).reasonCodes).toEqual(['dataset-coverage:ratios'])
    expect(validateCoreCandidate(report({ failedScoringAssets: 1 }), policy, now).reasonCodes)
      .toEqual(['scoring-failures'])
    expect(validateCoreCandidate(report({
      totalAssets: 0, scoredAssets: 0, datasets: {},
    }), policy, now).reasonCodes)
      .toContain('candidate-empty')
    expect(validateCoreCandidate(report({
      createdAt: new Date('2026-09-01T08:00:00.000Z'),
    }), policy, now).reasonCodes).toEqual(['candidate-stale'])
  })

  it('never calls publication in preview while reporting that an eligible candidate would publish', async () => {
    const publisher = { publishCandidate: jest.fn() }

    await expect(executePublicationGate({
      report: report(), policy, now, mode: 'preview', expectedCurrentGenerationId: null, publisher,
    })).resolves.toMatchObject({ status: 'preview', eligible: true, wouldPublish: true, published: false })
    expect(publisher.publishCandidate).not.toHaveBeenCalled()
  })

  it('rejects impossible candidate counters before calculating coverage', () => {
    expect(validateCoreCandidate(report({ scoredAssets: 11 }), policy, now).reasonCodes)
      .toEqual(['candidate-counts-invalid'])
    expect(validateCoreCandidate(report({
      datasets: { profile: { successfulAssets: -1, failedAssets: 0 } },
    }), policy, now).reasonCodes).toEqual(['candidate-counts-invalid'])
  })

  it('does not publish a rejected candidate and preserves the current generation', async () => {
    const publisher = { publishCandidate: jest.fn() }

    await expect(executePublicationGate({
      report: report({ failedScoringAssets: 1 }), policy, now,
      mode: 'publish', expectedCurrentGenerationId: 'generation-old', publisher,
    })).resolves.toMatchObject({ status: 'rejected', eligible: false, wouldPublish: false, published: false })
    expect(publisher.publishCandidate).not.toHaveBeenCalled()
  })

  it('publishes only after validation and exposes atomic publication conflicts', async () => {
    const published = { publishCandidate: jest.fn().mockResolvedValue({
      status: 'published', currentGenerationId: 'generation-a', previousGenerationId: null, revision: 1,
    }) }
    const conflict = { publishCandidate: jest.fn().mockResolvedValue({ status: 'conflict' }) }

    await expect(executePublicationGate({
      report: report(), policy, now, mode: 'publish', expectedCurrentGenerationId: null,
      publisher: published,
    })).resolves.toMatchObject({ status: 'published', published: true })
    await expect(executePublicationGate({
      report: report(), policy, now, mode: 'publish', expectedCurrentGenerationId: null,
      publisher: conflict,
    })).resolves.toMatchObject({ status: 'conflict', published: false })
  })
})
