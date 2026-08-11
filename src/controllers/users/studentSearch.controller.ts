import type { RequestHandler } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import {
  MAX_CRITERION_LENGTH,
  MAX_SEARCH_RESULTS,
  STUDENT_SEARCH_CRITERIA,
  type StudentSearchCriteria,
} from '../../services/users/studentSearch.contract'
import type { StudentSearchService } from '../../services/users/studentSearch.service'

const MISSING_CRITERIA_MESSAGE =
  'Pelo menos um critério de pesquisa é necessário (email, name, discordId, hotmartUserId, ou curseducaUserId).'
const TERM_TOO_LONG_MESSAGE = 'Termo de pesquisa demasiado longo.'
const NOT_FOUND_MESSAGE = 'Nenhum aluno encontrado com os critérios fornecidos.'
const TRUNCATED_MESSAGE =
  `Mais de ${MAX_SEARCH_RESULTS} alunos encontrados; refine a pesquisa`

type CriteriaOutcome =
  | { ok: true; criteria: StudentSearchCriteria }
  | { ok: false; message: string }

/**
 * Only trimmed, non-empty strings within the length bound become criteria.
 * A criterion supplied as an array or object is rejected rather than ignored,
 * so a malformed query can never degrade into an unfiltered `find({})`.
 */
function readCriteria(query: Record<string, unknown>): CriteriaOutcome {
  const criteria: StudentSearchCriteria = {}

  for (const key of STUDENT_SEARCH_CRITERIA) {
    const value = query[key]
    if (value === undefined) continue

    if (typeof value !== 'string') return { ok: false, message: MISSING_CRITERIA_MESSAGE }
    if (value.length > MAX_CRITERION_LENGTH) return { ok: false, message: TERM_TOO_LONG_MESSAGE }

    const term = value.trim()
    if (!term) continue
    if (term.length > MAX_CRITERION_LENGTH) return { ok: false, message: TERM_TOO_LONG_MESSAGE }

    criteria[key] = term
  }

  if (Object.keys(criteria).length === 0) {
    return { ok: false, message: MISSING_CRITERIA_MESSAGE }
  }

  return { ok: true, criteria }
}

export function createStudentSearchController(
  service: Pick<StudentSearchService, 'search'>,
): RequestHandler {
  return async (req, res, next) => {
    // Validation runs before the try, so a rejected request is a 400 and never
    // reaches the error boundary.
    const outcome = readCriteria(req.query as Record<string, unknown>)

    if (!outcome.ok) {
      res.status(400).json({ message: outcome.message })
      return
    }

    try {
      const { students, truncated } = await service.search(outcome.criteria)

      if (!students.length) {
        res.status(404).json({ message: NOT_FOUND_MESSAGE })
        return
      }

      if (students.length > 1) {
        res.status(200).json(successResponse(students, {
          message: truncated ? TRUNCATED_MESSAGE : `Encontrados ${students.length} alunos`,
          multiple: true,
          truncated,
        }))
        return
      }

      res.status(200).json(successResponse(students[0]))
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'STUDENT_SEARCH_FAILED',
        publicMessage: 'Erro ao buscar aluno.',
        cause: error,
      }))
    }
  }
}
