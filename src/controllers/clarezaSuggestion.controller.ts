import type { NextFunction, Request, RequestHandler, Response } from 'express'

import { internalError } from '../security/errorHandling'
import { successResponse } from '../contracts/responseContract'
import { submitCoreSuggestion } from '../services/clareza/core/coreSuggestion.runtime'
import { CoreSuggestionValidationError } from '../services/clareza/core/coreSuggestionService'

interface ClarezaSuggestionControllerDependencies {
  readonly submit: typeof submitCoreSuggestion
}

export function createClarezaSuggestionController(
  dependencies: ClarezaSuggestionControllerDependencies,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dependencies.submit(
        typeof req.body?.q === 'string' ? req.body.q : '',
        typeof req.body?.submissionId === 'string' ? req.body.submissionId : '',
      )
      return res.status(result.outcome === 'accepted' ? 202 : 200).json(successResponse(result))
    } catch (error: unknown) {
      if (error instanceof CoreSuggestionValidationError) {
        return res.status(400).json({ error: 'Sugestão inválida.' })
      }
      next(internalError(
        'Não foi possível registar a sugestão.',
        'CLAREZA_SUGGESTION_WRITE_FAILED',
        error,
      ))
      return
    }
  }
}

export const submitClarezaSuggestion = createClarezaSuggestionController({
  submit: submitCoreSuggestion,
})
