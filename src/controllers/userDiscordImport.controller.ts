import type { RequestHandler } from 'express'
import { HttpError } from '../security/errorHandling'
import { withUploadedFileCleanup } from '../security/usersImportUpload'
import { discordIdentityImportService } from '../services/users/discordIdentityImport.runtime'
import type { DiscordIdentityImportService } from '../services/users/discordIdentityImport.service'

type ImportService = Pick<DiscordIdentityImportService, 'execute'>

function importFailure(error: unknown): HttpError {
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

      res.json({
        message: 'Sincronização concluída',
        syncId: result.syncId,
        stats: result.stats,
      })
    } catch (error) {
      next(importFailure(error))
    }
  }
}

export const syncDiscordAndHotmart =
  createUserDiscordImportController(discordIdentityImportService)
