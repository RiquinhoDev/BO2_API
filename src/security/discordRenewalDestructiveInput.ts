import { z } from 'zod'
import { validatedSchema } from './validatedInput'

const actor = z.string().min(1).optional()

export const discordRenewalExecuteInput = validatedSchema({
  params: {},
  query: {},
  body: {
    batchId: z.string().min(1).optional(),
    includePlanned: z.boolean().optional(),
    limit: z.number().positive().optional(),
    actor,
  },
})

export const discordRenewalMessageSendInput = validatedSchema({
  params: {},
  query: {},
  body: {
    content: z.string().min(1),
    mentionRoleIds: z.array(z.string()),
    dataFim: z.string().min(1).optional(),
    channelId: z.string().min(1).optional(),
    templateKey: z.string().min(1).optional(),
    mentionEveryone: z.boolean().optional(),
    actor,
  },
})

export const discordRenewalScheduledTestInput = validatedSchema({
  params: {
    key: z.string().min(1),
  },
  query: {},
  body: { actor },
})

export const discordRenewalScheduledRunInput = validatedSchema({
  params: {},
  query: {},
  body: {},
})
