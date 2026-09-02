export interface CoreRetentionGenerationPort {
  retainCandidates(limit: number): Promise<void>
  listGenerationIds(): Promise<readonly string[]>
}

export interface CoreCompanionPrunerPort {
  readonly name: string
  prune(retainedGenerationIds: readonly string[]): Promise<number>
}

export interface CoreRetentionDependencies {
  readonly generations: CoreRetentionGenerationPort
  readonly companions: readonly CoreCompanionPrunerPort[]
  readonly candidateLimit: number
}

export interface CoreRetentionReport {
  readonly retainedGenerations: number
  readonly prunedCompanions: Readonly<Record<string, number>>
}

// Sem esta poda, cada refresh diário deixa a geração inteira e os companions
// da véspera em memória permanente. O limite protege sempre o ponteiro
// publicado e o seu anterior, garantidos por retainCandidates.
export function createCoreRetention(
  dependencies: CoreRetentionDependencies,
): () => Promise<CoreRetentionReport> {
  if (!Number.isInteger(dependencies.candidateLimit) || dependencies.candidateLimit < 1) {
    throw new RangeError('core retention candidate limit must be a positive integer')
  }
  const names = dependencies.companions.map(companion => companion.name)
  if (names.some(name => !name.trim()) || new Set(names).size !== names.length) {
    throw new RangeError('core retention companions require unique names')
  }

  return async () => {
    await dependencies.generations.retainCandidates(dependencies.candidateLimit)
    const retained = await dependencies.generations.listGenerationIds()
    if (!retained.length) throw new Error('core retention found no generation to protect')

    const pruned: Record<string, number> = {}
    for (const companion of dependencies.companions) {
      pruned[companion.name] = await companion.prune(retained)
    }
    return { retainedGenerations: retained.length, prunedCompanions: pruned }
  }
}
