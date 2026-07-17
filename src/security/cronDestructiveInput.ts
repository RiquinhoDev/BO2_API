import { z } from 'zod'
import { validatedSchema } from './validatedInput'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/)

export const cronJobIdInput = validatedSchema({
  params: { id: objectId },
  query: {},
  body: {},
})

export const cronEmptyInput = validatedSchema({
  params: {},
  query: {},
  body: {},
})

export type CronJobIdInput = z.infer<typeof cronJobIdInput>
export type CronEmptyInput = z.infer<typeof cronEmptyInput>
