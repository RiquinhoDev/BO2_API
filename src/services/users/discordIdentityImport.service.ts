import type { ImportedUserRecord } from '../../types/ImportedUserRecord'
import type { ImportedIdentityResult } from './userIdentityReconciliation.service'

export interface DiscordIdentityImportHistoryRepository {
  start(input: {
    actorEmail: string
    originalName: string
  }): Promise<string>
  complete(input: {
    syncId: string
    completedAt: Date
    stats: {
      total: number
      added: number
      errors: number
    }
  }): Promise<void>
  fail(input: {
    syncId: string
    completedAt: Date
  }): Promise<void>
}

export interface DiscordIdentityImportDependencies {
  readRecords(filePath: string): Promise<ImportedUserRecord[]>
  reconcile(input: {
    email: string
    discordId: string
  }): Promise<ImportedIdentityResult>
  history: DiscordIdentityImportHistoryRepository
  now(): Date
  logRecordError(input: {
    row: number
    error: unknown
  }): void
}

export interface DiscordIdentityImportInput {
  filePath: string
  originalName: string
  actorEmail: string
}

export interface DiscordIdentityImportResult {
  syncId: string
  stats: {
    added: number
    unmatched: number
    errors: number
  }
}

interface NormalizedIdentity {
  discordId: string
  email: string
}

function normalizeIdentity(
  record: ImportedUserRecord,
): NormalizedIdentity | null {
  const discordId = String(record['User ID'] ?? record.UserID ?? '').trim()
  const email = String(
    record['Qual o e-mail com que te inscreveste no curso?']
      ?? record.Email
      ?? '',
  ).trim().toLowerCase()

  return discordId && email ? { discordId, email } : null
}

export class DiscordIdentityImportService {
  constructor(
    private readonly dependencies: DiscordIdentityImportDependencies,
  ) {}

  async execute(
    input: DiscordIdentityImportInput,
  ): Promise<DiscordIdentityImportResult> {
    const syncId = await this.dependencies.history.start({
      actorEmail: input.actorEmail,
      originalName: input.originalName,
    })

    try {
      const records = await this.dependencies.readRecords(input.filePath)
      let added = 0
      let unmatched = 0
      let errors = 0

      for (const [index, record] of records.entries()) {
        const identity = normalizeIdentity(record)
        if (!identity) {
          unmatched += 1
          continue
        }

        try {
          const result = await this.dependencies.reconcile(identity)
          if (result === 'added') added += 1
          if (result === 'unmatched') unmatched += 1
        } catch (error) {
          errors += 1
          this.dependencies.logRecordError({
            row: index + 2,
            error,
          })
        }
      }

      await this.dependencies.history.complete({
        syncId,
        completedAt: this.dependencies.now(),
        stats: {
          total: records.length,
          added,
          errors,
        },
      })

      return {
        syncId,
        stats: { added, unmatched, errors },
      }
    } catch (error) {
      await this.dependencies.history.fail({
        syncId,
        completedAt: this.dependencies.now(),
      })
      throw error
    }
  }
}
