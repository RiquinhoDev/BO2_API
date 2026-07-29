import SyncHistory from '../../models/SyncHistory'
import type { DiscordIdentityImportHistoryRepository } from './discordIdentityImport.service'

export class MongooseDiscordIdentityImportHistoryRepository
implements DiscordIdentityImportHistoryRepository {
  async start(input: {
    actorEmail: string
    originalName: string
  }): Promise<string> {
    const history = await new SyncHistory({
      type: 'csv',
      user: input.actorEmail,
      metadata: { fileName: input.originalName },
      status: 'running',
    }).save()

    return history.id
  }

  async complete(input: {
    syncId: string
    completedAt: Date
    stats: {
      total: number
      added: number
      errors: number
    }
  }): Promise<void> {
    await SyncHistory.findByIdAndUpdate(input.syncId, {
      status: 'completed',
      completedAt: input.completedAt,
      stats: {
        ...input.stats,
        updated: 0,
        conflicts: 0,
      },
    })
  }

  async fail(input: {
    syncId: string
    completedAt: Date
  }): Promise<void> {
    await SyncHistory.findByIdAndUpdate(input.syncId, {
      status: 'failed',
      completedAt: input.completedAt,
    })
  }
}
