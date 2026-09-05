import type { RequestHandler } from 'express'
import { successResponse } from '../contracts/responseContract'
import { HttpError } from '../security/errorHandling'
import { withUploadedFileCleanup } from '../security/usersImportUpload'
import { discordIdentityImportService } from '../services/users/discordIdentityImport.runtime'
import {
  DiscordIdentityImportLimitError,
  MAX_DISCORD_IDENTITY_IMPORT_ROWS,
  type DiscordIdentityImportService,
} from '../services/users/discordIdentityImport.service'

type ImportService = Pick<DiscordIdentityImportService, 'execute'>

function importFailure(error: unknown): HttpError {
  if (error instanceof DiscordIdentityImportLimitError) {
    return new HttpError({
      status: 413,
      code: 'USER_IMPORT_LIMIT_EXCEEDED',
      publicMessage: `Importação limitada a ${MAX_DISCORD_IDENTITY_IMPORT_ROWS} registos`,
      cause: error,
    })
  }
  return error instanceof HttpError
    ? error
    : new HttpError({
        status: 500,
        code: 'USER_IMPORT_FAILED',
        publicMessage: 'Erro na sincronização',
        cause: error,
      })
}

export function createUserDiscordImportController(
  service: ImportService,
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    if (!req.file) {
      next(
        new HttpError({
          status: 400,
          code: 'UPLOAD_FILE_REQUIRED',
          publicMessage: 'Nenhum ficheiro carregado',
        }),
      )
      return
    }

    const uploadedFile = req.file
    try {
      const result = await withUploadedFileCleanup(
        uploadedFile,
        (filePath) => service.execute({
          filePath,
          originalName: uploadedFile.originalname,
          actorEmail: req.user?.email ?? 'system',
        }),
      )

      res.json(successResponse({ syncId: result.syncId, stats: result.stats }, {
        message: 'Sincronização concluída',
      }))
    } catch (error) {
      next(importFailure(error))
    }
  }
}

export const syncDiscordAndHotmart =
  createUserDiscordImportController(discordIdentityImportService)
