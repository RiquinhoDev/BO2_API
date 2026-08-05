import type { RequestHandler } from 'express'
import { HttpError } from '../../security/errorHandling'
import {
  STUDENT_SEARCH_CRITERIA,
  type StudentSearchCriteria,
} from '../../services/users/studentSearch.contract'
import type { StudentSearchService } from '../../services/users/studentSearch.service'

const MISSING_CRITERIA_MESSAGE =
  'Pelo menos um critério de pesquisa é necessário (email, name, discordId, hotmartUserId, ou curseducaUserId).'
const NOT_FOUND_MESSAGE = 'Nenhum aluno encontrado com os critérios fornecidos.'

/** Only string query values count, matching the legacy `typeof` guards. */
function readCriteria(query: Record<string, unknown>): StudentSearchCriteria {
  const criteria: StudentSearchCriteria = {}

  for (const key of STUDENT_SEARCH_CRITERIA) {
    const value = query[key]
    if (typeof value === 'string' && value) criteria[key] = value
  }

  return criteria
}

function hasAnyCriterion(query: Record<string, unknown>): boolean {
  return STUDENT_SEARCH_CRITERIA.some(key => Boolean(query[key]))
}

export function createStudentSearchController(
  service: Pick<StudentSearchService, 'search'>,
): RequestHandler {
  return async (req, res, next) => {
    // The guard runs before the try, so a missing criterion is a 400 and never
    // reaches the error boundary.
    if (!hasAnyCriterion(req.query as Record<string, unknown>)) {
      res.status(400).json({ message: MISSING_CRITERIA_MESSAGE })
      return
    }

    try {
      const students = await service.search(readCriteria(req.query as Record<string, unknown>))

      if (!students.length) {
        res.status(404).json({ message: NOT_FOUND_MESSAGE })
        return
      }

      if (students.length > 1) {
        res.status(200).json({
          message: `Encontrados ${students.length} alunos`,
          students,
          multiple: true,
        })
        return
      }

      // A single match is returned unwrapped.
      res.status(200).json(students[0])
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
