import type { ValidatedInputHandler } from '../security/validatedInput'
import type { UsersSimpleListSchema } from '../security/usersSimpleListInput'
import type { UsersSimpleListService } from '../services/users/usersSimpleList.service'

export function createUsersSimpleListController(
  service: Pick<UsersSimpleListService, 'list'>,
): ValidatedInputHandler<UsersSimpleListSchema> {
  return async (input, _req, res) => {
    const result = await service.list(input.query)
    res.json(result)
  }
}
