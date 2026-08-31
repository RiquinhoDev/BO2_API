import {
  CorePipelineOrchestrator,
  type CoreComplementStage,
} from '../../../src/services/clareza/core/corePipelineOrchestrator'
import type {
  CoreCandidateReport,
  CorePublicationPolicy,
} from '../../../src/services/clareza/core/corePublicationGate'

const policy: CorePublicationPolicy = {
  requiredDatasets: ['profile'],
  minimumDatasetCoverage: { profile: 1 },
  minimumScoringCoverage: 1,
  maximumScoringFailures: 0,
  maximumAgeMs: 3_600_000,
}
const candidate: CoreCandidateReport = {
  generationId: 'generation-a', createdAt: new Date('2026-09-01T10:00:00.000Z'),
  totalAssets: 1, datasets: { profile: { successfulAssets: 1, failedAssets: 0 } },
  scoredAssets: 1, failedScoringAssets: 0,
}
const now = new Date('2026-09-01T10:30:00.000Z')

describe('CorePipelineOrchestrator', () => {
  it('blocks publication and every complement when the core gate rejects', async () => {
    const publisher = { publishCandidate: jest.fn() }
    const complement = { name: 'raiox', execute: jest.fn() }
    const orchestrator = new CorePipelineOrchestrator({
      prepareCore: async () => ({ ...candidate, failedScoringAssets: 1 }),
      publisher, policy, complements: [complement],
    })

    await expect(orchestrator.run({
      executionId: 'execution-a', mode: 'publish', now, expectedCurrentGenerationId: null,
    })).resolves.toMatchObject({
      status: 'failed', candidateId: 'generation-a', wouldPublish: false, published: false,
      stages: [
        { name: 'core', status: 'success' },
        { name: 'publication', status: 'failed' },
        { name: 'raiox', status: 'skipped' },
      ],
    })
    expect(publisher.publishCandidate).not.toHaveBeenCalled()
    expect(complement.execute).not.toHaveBeenCalled()
  })

  it('runs a safe complement preview without touching publication', async () => {
    const publisher = { publishCandidate: jest.fn() }
    const complement = { name: 'raiox', execute: jest.fn().mockResolvedValue(undefined) }
    const orchestrator = new CorePipelineOrchestrator({
      prepareCore: async () => candidate, publisher, policy, complements: [complement],
    })

    await expect(orchestrator.run({
      executionId: 'execution-b', mode: 'preview', now, expectedCurrentGenerationId: null,
    })).resolves.toMatchObject({
      status: 'success', wouldPublish: true, published: false,
      stages: [
        { name: 'core', status: 'success' },
        { name: 'publication', status: 'skipped' },
        { name: 'raiox', status: 'success' },
      ],
    })
    expect(publisher.publishCandidate).not.toHaveBeenCalled()
    expect(complement.execute).toHaveBeenCalledWith({ generationId: 'generation-a', mode: 'preview' })
  })

  it('publishes before complements and keeps later stages after a partial failure', async () => {
    const order: string[] = []
    const publisher = { publishCandidate: jest.fn(async () => {
      order.push('publish')
      return { status: 'published' as const, currentGenerationId: 'generation-a',
        previousGenerationId: null, revision: 1 }
    }) }
    const complements: CoreComplementStage[] = [
      { name: 'raiox', execute: async () => { order.push('raiox'); throw new Error('synthetic') } },
      { name: 'earnings', execute: async () => { order.push('earnings') } },
    ]
    const orchestrator = new CorePipelineOrchestrator({
      prepareCore: async () => candidate, publisher, policy, complements,
    })

    await expect(orchestrator.run({
      executionId: 'execution-c', mode: 'publish', now, expectedCurrentGenerationId: null,
    })).resolves.toMatchObject({
      status: 'partial', published: true,
      stages: [
        { name: 'core', status: 'success' },
        { name: 'publication', status: 'success' },
        { name: 'raiox', status: 'failed' },
        { name: 'earnings', status: 'success' },
      ],
    })
    expect(order).toEqual(['publish', 'raiox', 'earnings'])
  })

  it('does not authorize complements after an atomic publication conflict', async () => {
    const complement = { name: 'raiox', execute: jest.fn() }
    const orchestrator = new CorePipelineOrchestrator({
      prepareCore: async () => candidate,
      publisher: { publishCandidate: async () => ({ status: 'conflict' }) },
      policy, complements: [complement],
    })

    await expect(orchestrator.run({
      executionId: 'execution-d', mode: 'publish', now, expectedCurrentGenerationId: 'old',
    })).resolves.toMatchObject({ status: 'failed', published: false })
    expect(complement.execute).not.toHaveBeenCalled()
  })
})
