import { z } from 'zod'
import { validatedSchema } from './validatedInput'

const boundedInteger = (defaultValue: number, maximum: number) =>
  z.union([
    z.number().int(),
    z.string().regex(/^\d+$/).transform(Number),
  ])
    .pipe(z.number().int().min(1).max(maximum))
    .default(defaultValue)

const cronExpression = z.string().trim().min(1).max(100)

export const cronTagsEmptyInput = validatedSchema({
  params: {},
  query: {},
  body: {},
})

export const cronTagsConfigInput = validatedSchema({
  params: {},
  query: {},
  body: {
    cronExpression,
    isActive: z.boolean(),
  },
})

export const cronTagsHistoryInput = validatedSchema({
  params: {},
  query: {
    limit: boundedInteger(10, 200),
  },
  body: {},
})

export const cronTagsStatisticsInput = validatedSchema({
  params: {},
  query: {
    days: boundedInteger(30, 365),
  },
  body: {},
})

export const cronTagsJobHistoryInput = validatedSchema({
  params: {
    id: z.string().regex(/^[a-f\d]{24}$/i),
  },
  query: {
    limit: boundedInteger(20, 200),
  },
  body: {},
})

export const cronTagsValidateInput = validatedSchema({
  params: {},
  query: {},
  body: {
    cronExpression,
  },
})

export type CronTagsConfigInput = z.infer<typeof cronTagsConfigInput>
export type CronTagsHistoryInput = z.infer<typeof cronTagsHistoryInput>
export type CronTagsStatisticsInput = z.infer<typeof cronTagsStatisticsInput>
export type CronTagsJobHistoryInput = z.infer<typeof cronTagsJobHistoryInput>
export type CronTagsValidateInput = z.infer<typeof cronTagsValidateInput>
