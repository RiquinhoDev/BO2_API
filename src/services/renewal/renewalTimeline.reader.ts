import type { FilterQuery, Model } from 'mongoose'
import { assertMainParityOwnership } from './mainParityExecution'

export const TIMELINE_COHORT_CAP = 20000
export const TIMELINE_BATCH_SIZE = 200

/** Read the complete selected cohort; overflow is an error, never truncation. */
export async function readTimelineDocuments<T>(
  model: Model<T>, filter: FilterQuery<T>, projection = '',
): Promise<T[]> {
  assertMainParityOwnership()
  const cursor = model.find(filter).select(projection).sort({ _id: 1 })
    .maxTimeMS(5000).lean<T[]>().cursor({ batchSize: TIMELINE_BATCH_SIZE })
  const rows: T[] = []
  try {
    for await (const row of cursor) {
      assertMainParityOwnership()
      if (rows.length >= TIMELINE_COHORT_CAP) throw new Error('Timeline read exceeds cohort cap')
      rows.push(row)
    }
  } finally { await cursor.close() }
  return rows
}

export async function readTimelineBatches<T>(
  model: Model<T>, field: string, values: unknown[], projection = '',
): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; offset < values.length; offset += TIMELINE_BATCH_SIZE) {
    const filter = { [field]: { $in: values.slice(offset, offset + TIMELINE_BATCH_SIZE) } } as FilterQuery<T>
    rows.push(...await readTimelineDocuments(model, filter, projection))
    if (rows.length > TIMELINE_COHORT_CAP) throw new Error('Timeline batch read exceeds cohort cap')
  }
  return rows
}

export interface TimelineUser {
  _id: import('mongoose').Types.ObjectId
  email: string
  hotmart?: { enrolledClasses?: Array<{ classId?: string; className: string; enrolledAt?: Date; isActive?: boolean }> }
}

export function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}
