import type { ValidatedInputHandler } from '../security/validatedInput'
import { successResponse } from '../contracts/responseContract'
import type { UsersSimpleListSchema } from '../security/usersSimpleListInput'
import type { UsersSimpleListService } from '../services/users/usersSimpleList.service'

export function createUsersSimpleListController(
  service: Pick<UsersSimpleListService, 'list'>,
): ValidatedInputHandler<UsersSimpleListSchema> {
  return async (input, _req, res) => {
    const result = await service.list(input.query)
    res.json(successResponse(result.users, { page: result.pagination.page, limit: result.pagination.limit, total: result.pagination.total, pages: result.pagination.pages }))
  }
}
