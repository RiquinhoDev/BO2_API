import { z } from 'zod'
import { validatedSchema } from './validatedInput'

export const tagMonitoringDeleteInput = validatedSchema({
  params: {
    id: z.string().regex(/^[0-9a-fA-F]{24}$/),
  },
  query: {},
  body: {},
})

export const tagMonitoringSnapshotManualInput = validatedSchema({
  params: {},
  query: {},
  body: { dryRun: z.boolean().optional() },
})

export type TagMonitoringDeleteInput = z.infer<typeof tagMonitoringDeleteInput>
export type TagMonitoringSnapshotManualInput = z.infer<typeof tagMonitoringSnapshotManualInput>
