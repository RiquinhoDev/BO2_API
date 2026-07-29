import type { ImportedUserRecord } from '../../../src/types/ImportedUserRecord'
import {
  type DiscordIdentityImportHistoryRepository,
  DiscordIdentityImportService,
} from '../../../src/services/users/discordIdentityImport.service'

class InMemoryImportHistory implements DiscordIdentityImportHistoryRepository {
  readonly started: Array<{ actorEmail: string; originalName: string }> = []
  readonly completed: Array<{
    syncId: string
    completedAt: Date
    stats: { total: number; added: number; errors: number }
  }> = []
  readonly failed: Array<{ syncId: string; completedAt: Date }> = []

  async start(input: {
    actorEmail: string
    originalName: string
  }): Promise<string> {
    this.started.push(input)
    return 'sync-1'
  }

  async complete(input: {
    syncId: string
    completedAt: Date
    stats: { total: number; added: number; errors: number }
  }): Promise<void> {
    this.completed.push(input)
  }

  async fail(input: {
    syncId: string
    completedAt: Date
  }): Promise<void> {
    this.failed.push(input)
  }
}

function importedRecord(discordId: string, email: string): ImportedUserRecord {
  return {
    'User ID': discordId,
    'Qual o e-mail com que te inscreveste no curso?': email,
  }
}

test('imports valid identities and isolates malformed or failed rows', async () => {
  const history = new InMemoryImportHistory()
  const reconciled: Array<{ email: string; discordId: string }> = []
  const loggedRows: number[] = []
  const rows = [
    importedRecord(' discord-added ', ' ADDED@example.test '),
    importedRecord('discord-unchanged', 'unchanged@example.test'),
    importedRecord('discord-unmatched', 'unmatched@example.test'),
    importedRecord('', 'invalid@example.test'),
    importedRecord('discord-error', 'error@example.test'),
  ]
  const service = new DiscordIdentityImportService({
    readRecords: async () => rows,
    reconcile: async (input) => {
      reconciled.push(input)
      if (input.email === 'error@example.test') throw new Error('row failed')
      if (input.email === 'unmatched@example.test') return 'unmatched'
      if (input.email === 'unchanged@example.test') return 'unchanged'
      return 'added'
    },
    history,
    now: () => new Date('2026-07-29T12:00:00.000Z'),
    logRecordError: ({ row }) => loggedRows.push(row),
  })

  const result = await service.execute({
    filePath: 'C:\\tmp\\users.csv',
    originalName: 'users.csv',
    actorEmail: 'admin@example.test',
  })

  expect(result).toEqual({
    syncId: 'sync-1',
    stats: { added: 1, unmatched: 2, errors: 1 },
  })
  expect(history.started).toEqual([{
    actorEmail: 'admin@example.test',
    originalName: 'users.csv',
  }])
  expect(reconciled).toEqual([
    { discordId: 'discord-added', email: 'added@example.test' },
    { discordId: 'discord-unchanged', email: 'unchanged@example.test' },
    { discordId: 'discord-unmatched', email: 'unmatched@example.test' },
    { discordId: 'discord-error', email: 'error@example.test' },
  ])
  expect(loggedRows).toEqual([6])
  expect(history.completed).toEqual([{
    syncId: 'sync-1',
    completedAt: new Date('2026-07-29T12:00:00.000Z'),
    stats: { total: 5, added: 1, errors: 1 },
  }])
  expect(history.failed).toEqual([])
})

test('marks an existing history record failed when workbook reading aborts', async () => {
  const history = new InMemoryImportHistory()
  const service = new DiscordIdentityImportService({
    readRecords: async () => {
      throw new Error('workbook failed')
    },
    reconcile: async () => 'unchanged',
    history,
    now: () => new Date('2026-07-29T13:00:00.000Z'),
    logRecordError: () => undefined,
  })

  await expect(service.execute({
    filePath: 'C:\\tmp\\broken.xlsx',
    originalName: 'broken.xlsx',
    actorEmail: 'admin@example.test',
  })).rejects.toThrow('workbook failed')

  expect(history.completed).toEqual([])
  expect(history.failed).toEqual([{
    syncId: 'sync-1',
    completedAt: new Date('2026-07-29T13:00:00.000Z'),
  }])
})

test('does not record failure when history creation itself fails', async () => {
  const history = new InMemoryImportHistory()
  history.start = async () => {
    throw new Error('history unavailable')
  }
  const readRecords = jest.fn<Promise<ImportedUserRecord[]>, [string]>()
  const service = new DiscordIdentityImportService({
    readRecords,
    reconcile: async () => 'unchanged',
    history,
    now: () => new Date('2026-07-29T14:00:00.000Z'),
    logRecordError: () => undefined,
  })

  await expect(service.execute({
    filePath: 'C:\\tmp\\users.csv',
    originalName: 'users.csv',
    actorEmail: 'admin@example.test',
  })).rejects.toThrow('history unavailable')

  expect(readRecords).not.toHaveBeenCalled()
  expect(history.completed).toEqual([])
  expect(history.failed).toEqual([])
})
