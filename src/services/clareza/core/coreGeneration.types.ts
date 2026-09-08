export type CoreAssetKind = 'stock' | 'fund' | 'crypto'

export interface CoreAssetRecord {
  readonly ticker: string
  readonly kind: CoreAssetKind
  readonly datasets: Readonly<Record<string, unknown>>
}

export interface CoreGenerationCandidate {
  readonly generationId: string
  readonly universeVersion: string
  readonly dataVersion: string
  readonly createdAt: Date
  readonly records: readonly CoreAssetRecord[]
}

export interface PublishedGenerationPointer {
  readonly status: 'published'
  readonly currentGenerationId: string
  readonly previousGenerationId: string | null
  readonly revision: number
}

export type PublicationResult =
  | PublishedGenerationPointer
  | { readonly status: 'conflict' }
  | { readonly status: 'missing' }

export interface CoreGenerationStore {
  createCandidate(candidate: CoreGenerationCandidate): Promise<void>
  readCandidate(generationId: string): Promise<CoreGenerationCandidate | null>
  readPublished(): Promise<CoreGenerationCandidate | null>
  publishCandidate(
    generationId: string,
    expectedCurrentGenerationId: string | null,
  ): Promise<PublicationResult>
  rollback(expectedCurrentGenerationId: string): Promise<PublicationResult>
  retainCandidates(limit: number): Promise<void>
}
