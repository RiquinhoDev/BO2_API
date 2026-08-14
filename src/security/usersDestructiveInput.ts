import { z } from 'zod'
import { MAX_BULK_OPERATION_ITEMS } from './bulkOperationPolicy'
import { validatedSchema } from './validatedInput'

const id = z.string().min(1)
const ids = z.array(id).min(1).max(MAX_BULK_OPERATION_ITEMS)

export const usersBulkDeleteInput = validatedSchema({
  params: {},
  query: {},
  body: { ids },
})

export const usersDeleteByIdInput = validatedSchema({
  params: { id },
  query: {},
  body: {},
})

export const usersDeleteStudentInput = validatedSchema({
  params: { id },
  query: {
    permanent: z.enum(['true', 'false']).optional(),
  },
  body: {},
})

export type UsersBulkDeleteInput = z.infer<typeof usersBulkDeleteInput>
export type UsersDeleteByIdInput = z.infer<typeof usersDeleteByIdInput>
export type UsersDeleteStudentInput = z.infer<typeof usersDeleteStudentInput>
