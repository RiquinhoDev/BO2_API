import { successResponse } from '../contracts/responseContract'
import { HttpError } from '../security/errorHandling'
import {
  userIdentityBulkMergeInput,
  userIdentityManualMatchInput,
  userIdentityMergeInput,
} from '../security/userIdentityInput'
import {
  usersBulkDeleteInput,
  usersDeleteByIdInput,
} from '../security/usersDestructiveInput'
import type { ValidatedInputHandler } from '../security/validatedInput'
import { userIdentityReconciliationService as service } from '../services/users/userIdentityReconciliation.runtime'

function internalError(
  code: string,
  publicMessage: string,
  cause: unknown,
): HttpError {
  return new HttpError({
    status: 500,
    code,
    publicMessage,
    cause,
  })
}

export const mergeDiscordId: ValidatedInputHandler<
  typeof userIdentityMergeInput
> = async (input, _req, res, next) => {
  try {
    const user = await service.mergeIdentity({
      reviewId: input.body.id,
      email: input.body.email,
      discordId: input.body.newDiscordId,
    })
    if (!user) {
      res.status(404).json({ message: 'Utilizador não encontrado.' })
      return
    }

    res.status(200).json(successResponse(
      {
        email: user.email,
        discordIds: user.discordIds,
      },
      { message: 'Merge concluído com sucesso.' },
    ))
  } catch (error) {
    next(internalError('DISCORD_IDENTITY_MERGE_FAILED', 'Erro interno no merge', error))
  }
}

export const manualMatch: ValidatedInputHandler<
  typeof userIdentityManualMatchInput
> = async (input, _req, res, next) => {
  try {
    const user = await service.manualMatch(input.body)
    if (!user) {
      res.status(404).json({ message: 'Utilizador não encontrado no Hotmart.' })
      return
    }

    res.status(200).json(successResponse(
      {
        email: user.email,
        discordIds: user.discordIds,
        name: user.name,
      },
      { message: 'Correspondência manual criada com sucesso.' },
    ))
  } catch (error) {
    next(
      internalError(
        'DISCORD_IDENTITY_MANUAL_MATCH_FAILED',
        'Erro na correspondência manual',
        error,
      ),
    )
  }
}

export const bulkMergeIds: ValidatedInputHandler<
  typeof userIdentityBulkMergeInput
> = async (input, _req, res, next) => {
  try {
    const result = await service.bulkMerge(input.body.ids)
    res.status(200).json(successResponse(
      {
        mergedCount: result.mergedCount,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
      { message: `${result.mergedCount} merges concluídos com sucesso.` },
    ))
  } catch (error) {
    next(
      internalError(
        'DISCORD_IDENTITY_BULK_MERGE_FAILED',
        'Erro no merge em lote',
        error,
      ),
    )
  }
}

export const deleteIdsDiferentes: ValidatedInputHandler<
  typeof usersDeleteByIdInput
> = async (input, _req, res, next) => {
  try {
    if (!await service.deleteReview(input.params.id)) {
      res.status(404).json({ message: 'Registo não encontrado.' })
      return
    }
    res.status(200).json(successResponse(
      null,
      { message: 'Registo removido com sucesso.' },
    ))
  } catch (error) {
    next(
      internalError(
        'DISCORD_IDENTITY_REVIEW_DELETE_FAILED',
        'Erro ao apagar registo.',
        error,
      ),
    )
  }
}

export const deleteUnmatchedUser: ValidatedInputHandler<
  typeof usersDeleteByIdInput
> = async (input, _req, res, next) => {
  try {
    if (!await service.deleteUnmatched(input.params.id)) {
      res.status(404).json({ message: 'Utilizador não encontrado.' })
      return
    }
    res.status(200).json(successResponse(
      null,
      { message: 'Utilizador apagado com sucesso.' },
    ))
  } catch (error) {
    next(
      internalError(
        'DISCORD_IDENTITY_UNMATCHED_DELETE_FAILED',
        'Erro ao apagar utilizador.',
        error,
      ),
    )
  }
}

export const bulkDeleteIds: ValidatedInputHandler<
  typeof usersBulkDeleteInput
> = async (input, _req, res, next) => {
  try {
    const deletedCount = await service.deleteReviews(input.body.ids)
    res.status(200).json(successResponse(
      { deletedCount },
      {
        message: `${deletedCount} registos eliminados com sucesso.`,
      },
    ))
  } catch (error) {
    next(
      internalError(
        'DISCORD_IDENTITY_REVIEW_BULK_DELETE_FAILED',
        'Erro na eliminação em lote',
        error,
      ),
    )
  }
}

export const bulkDeleteUnmatchedUsers: ValidatedInputHandler<
  typeof usersBulkDeleteInput
> = async (input, _req, res, next) => {
  try {
    const deletedCount = await service.deleteUnmatchedUsers(input.body.ids)
    res.status(200).json(successResponse(
      { deletedCount },
      {
        message: `${deletedCount} utilizadores não correspondidos eliminados.`,
      },
    ))
  } catch (error) {
    next(
      internalError(
        'DISCORD_IDENTITY_UNMATCHED_BULK_DELETE_FAILED',
        'Erro na eliminação em lote',
        error,
      ),
    )
  }
}
