import { CoreGenerationUnavailableError } from './coreRadarProjection'

interface CompanionRefreshResult {
  readonly total: number
  readonly errors: number
}

interface CoreCompanionBackfillDependencies {
  readonly readPublished: () => Promise<{ readonly generationId: string } | null>
  readonly raiox: (generationId: string) => Promise<CompanionRefreshResult>
  readonly earnings: (generationId: string) => Promise<CompanionRefreshResult>
  readonly top10: (generationId: string) => Promise<CompanionRefreshResult>
}

export function createCoreCompanionBackfill(dependencies: CoreCompanionBackfillDependencies) {
  return async () => {
    const generation = await dependencies.readPublished()
    if (!generation) throw new CoreGenerationUnavailableError()

    const [raiox, earnings, top10] = await Promise.all([
      dependencies.raiox(generation.generationId),
      dependencies.earnings(generation.generationId),
      dependencies.top10(generation.generationId),
    ])

    return {
      generationId: generation.generationId,
      errors: raiox.errors + earnings.errors + top10.errors,
      raiox,
      earnings,
      top10,
    }
  }
}
