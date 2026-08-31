import {
  executePublicationGate,
  type CoreCandidateReport,
  type CoreExecutionMode,
  type CoreGenerationPublisher,
  type CorePublicationPolicy,
} from './corePublicationGate'

export interface CoreComplementStage {
  readonly name: string
  execute(input: { readonly generationId: string; readonly mode: CoreExecutionMode }): Promise<void>
}

export interface CorePipelineStageReport {
  readonly name: string
  readonly status: 'success' | 'failed' | 'skipped'
  readonly code?: string
}

export interface CorePipelineReport {
  readonly executionId: string
  readonly mode: CoreExecutionMode
  readonly status: 'success' | 'partial' | 'failed'
  readonly candidateId: string | null
  readonly wouldPublish: boolean
  readonly published: boolean
  readonly stages: readonly CorePipelineStageReport[]
}

interface CorePipelineDependencies {
  readonly prepareCore: () => Promise<CoreCandidateReport>
  readonly publisher: CoreGenerationPublisher
  readonly policy: CorePublicationPolicy
  readonly complements: readonly CoreComplementStage[]
}

interface RunCorePipelineInput {
  readonly executionId: string
  readonly mode: CoreExecutionMode
  readonly now: Date
  readonly expectedCurrentGenerationId: string | null
}

export class CorePipelineOrchestrator {
  constructor(private readonly dependencies: CorePipelineDependencies) {
    const names = dependencies.complements.map(stage => stage.name)
    if (names.some(name => !name.trim()) || new Set(names).size !== names.length) {
      throw new RangeError('complement stage names must be unique and non-empty')
    }
  }

  async run(input: RunCorePipelineInput): Promise<CorePipelineReport> {
    const stages: CorePipelineStageReport[] = []
    let report: CoreCandidateReport
    try {
      report = await this.dependencies.prepareCore()
      stages.push({ name: 'core', status: 'success' })
    } catch {
      stages.push({ name: 'core', status: 'failed', code: 'core-preparation-failed' })
      stages.push({ name: 'publication', status: 'skipped', code: 'core-unavailable' })
      stages.push(...this.skippedComplements('core-unavailable'))
      return this.result(input, 'failed', null, false, false, stages)
    }

    const gate = await executePublicationGate({
      report,
      policy: this.dependencies.policy,
      now: input.now,
      mode: input.mode,
      expectedCurrentGenerationId: input.expectedCurrentGenerationId,
      publisher: this.dependencies.publisher,
    })

    if (!gate.eligible) {
      stages.push({ name: 'publication', status: 'failed', code: gate.reasonCodes.join(',') })
      stages.push(...this.skippedComplements('core-rejected'))
      return this.result(input, 'failed', report.generationId, false, false, stages)
    }
    if (input.mode === 'preview') {
      stages.push({ name: 'publication', status: 'skipped', code: 'preview' })
    } else if (!gate.published) {
      stages.push({ name: 'publication', status: 'failed', code: gate.status })
      stages.push(...this.skippedComplements('publication-failed'))
      return this.result(input, 'failed', report.generationId, true, false, stages)
    } else {
      stages.push({ name: 'publication', status: 'success' })
    }

    let partial = false
    for (const complement of this.dependencies.complements) {
      try {
        await complement.execute({ generationId: report.generationId, mode: input.mode })
        stages.push({ name: complement.name, status: 'success' })
      } catch {
        partial = true
        stages.push({ name: complement.name, status: 'failed', code: 'stage-failed' })
      }
    }
    return this.result(
      input,
      partial ? 'partial' : 'success',
      report.generationId,
      true,
      gate.published,
      stages,
    )
  }

  private skippedComplements(code: string): CorePipelineStageReport[] {
    return this.dependencies.complements.map(stage => ({ name: stage.name, status: 'skipped', code }))
  }

  private result(
    input: RunCorePipelineInput,
    status: CorePipelineReport['status'],
    candidateId: string | null,
    wouldPublish: boolean,
    published: boolean,
    stages: readonly CorePipelineStageReport[],
  ): CorePipelineReport {
    return {
      executionId: input.executionId,
      mode: input.mode,
      status,
      candidateId,
      wouldPublish,
      published,
      stages,
    }
  }
}
