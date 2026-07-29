import { readImportedUsers } from '../importedUsersWorkbook'
import logger from '../../utils/logger'
import { DiscordIdentityImportService } from './discordIdentityImport.service'
import { MongooseDiscordIdentityImportHistoryRepository } from './mongooseDiscordIdentityImportHistory.repository'
import { userIdentityReconciliationService } from './userIdentityReconciliation.runtime'

export const discordIdentityImportService = new DiscordIdentityImportService({
  readRecords: readImportedUsers,
  reconcile: (input) =>
    userIdentityReconciliationService.reconcileImportedIdentity(input),
  history: new MongooseDiscordIdentityImportHistoryRepository(),
  now: () => new Date(),
  logRecordError: ({ row, error }) => {
    logger.error('Falha ao reconciliar registo do import Discord', {
      row,
      error,
    })
  },
})
