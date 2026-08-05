/**
 * Student write mutations behind PUT /:id, POST /:id/sync and DELETE /:id
 * (and their aliases). The reader owns every Mongoose write; the service holds
 * the pure branching (email validation, discordId dedupe, permanent vs soft).
 */

export interface StudentRecord {
  email?: string
  [key: string]: unknown
}

export interface EditStudentData {
  email?: string
  name?: string
  discordIds?: unknown
}

export type EditResult =
  | { kind: 'not_found' }
  | { kind: 'invalid_email' }
  | { kind: 'ok'; student: StudentRecord | null }

export type SyncResult =
  | { kind: 'not_found' }
  | { kind: 'ok'; email?: string }

export type RemoveResult =
  | { kind: 'not_found' }
  | { kind: 'deleted' }
  | { kind: 'blocked'; student: StudentRecord | null }

export interface StudentMutationsReader {
  findById(id: string): Promise<StudentRecord | null>
  applyUpdate(id: string, fields: Record<string, unknown>): Promise<StudentRecord | null>
  recalculateCombined(id: string): Promise<void>
  hardDelete(id: string): Promise<StudentRecord | null>
  clearClassHistory(id: string): Promise<void>
  block(id: string): Promise<StudentRecord | null>
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class StudentMutationsService {
  constructor(private readonly reader: StudentMutationsReader) {}

  async edit(id: string, data: EditStudentData): Promise<EditResult> {
    const current = await this.reader.findById(id)
    if (!current) return { kind: 'not_found' }

    const fields: Record<string, unknown> = {}

    if (data.email) {
      if (!EMAIL_PATTERN.test(data.email)) return { kind: 'invalid_email' }
      fields.email = data.email
    }

    if (data.name) fields.name = data.name

    if (data.discordIds && Array.isArray(data.discordIds)) {
      const uniqueIds = [...new Set(data.discordIds)]
      fields['discord.discordIds'] = uniqueIds
      fields['discordIds'] = uniqueIds
    }

    fields['metadata.updatedAt'] = new Date()

    const student = await this.reader.applyUpdate(id, fields)
    if (data.discordIds) await this.reader.recalculateCombined(id)

    return { kind: 'ok', student }
  }

  async sync(id: string): Promise<SyncResult> {
    const student = await this.reader.findById(id)
    if (!student) return { kind: 'not_found' }
    return { kind: 'ok', email: student.email }
  }

  async remove(id: string, permanent: string | undefined): Promise<RemoveResult> {
    if (permanent === 'true') {
      const deleted = await this.reader.hardDelete(id)
      if (!deleted) return { kind: 'not_found' }
      await this.reader.clearClassHistory(id)
      return { kind: 'deleted' }
    }

    const student = await this.reader.block(id)
    if (!student) return { kind: 'not_found' }
    return { kind: 'blocked', student }
  }
}
