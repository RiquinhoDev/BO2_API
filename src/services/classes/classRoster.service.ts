import { getLastLearnerActivityDate, type LearnerActivitySource } from '../activity/learnerActivity'

/**
 * Class roster reads behind GET /:classId/students and /users/search. The reader
 * owns every Mongoose read; the service holds the pure filter/query building and
 * formatting. A Clock is injected so timestamps are testable.
 *
 * Preserved verbatim as known legacy debt (hardening is separate): the raw regex
 * and uncapped limit/offset in search, the top-level `discordIds` search field,
 * the per-student N+1 className resolution, and the polymorphic single/multiple
 * search envelope.
 */

export interface Clock {
  now(): Date
}

export interface ClassRosterSummary {
  name?: string
  source?: string
}

export interface RosterUser {
  _id: unknown
  name?: string
  email?: string
  classId?: string
  hotmart?: { purchaseDate?: Date; status?: string; lastAccessDate?: unknown }
  metadata?: { createdAt?: Date }
  combined?: { status?: string }
  curseduca?: { joinedDate?: Date; memberStatus?: string; lastLogin?: unknown; lastAccess?: unknown }
  discord?: { discordIds?: string[] }
  communicationByCourse?: LearnerActivitySource['communicationByCourse']
}

export interface RosterQuery {
  includeInactive: boolean
  limit: number
  offset: number
  sortBy: string
  sortOrder: string
}

export interface SearchCriteria {
  email?: string
  name?: string
  discordId?: string
  classId?: string
  status?: string
  limit: number
  offset: number
}

export interface ClassRosterReader {
  getClassById(classId: string): Promise<ClassRosterSummary | null>
  findCurseducaMemberIds(classId: string, includeInactive: boolean): Promise<unknown[]>
  findStudents(filter: Record<string, unknown>, sort: Record<string, 1 | -1>, limit: number, offset: number): Promise<RosterUser[]>
  countStudents(filter: Record<string, unknown>): Promise<number>
  searchStudents(query: Record<string, unknown>, limit: number, offset: number): Promise<RosterUser[]>
  countSearch(query: Record<string, unknown>): Promise<number>
  resolveClassName(classId: string): Promise<string | null>
}

export interface FormattedStudent {
  _id: unknown
  name: string
  email?: string
  discordId?: string
  status: string
  estado: string
  joinedAt?: Date
  lastActivity: Date | null
  platform: 'curseduca' | 'hotmart'
}

export type RosterResult =
  | { kind: 'bad_request' }
  | { kind: 'not_found' }
  | { kind: 'ok'; className?: string; students: FormattedStudent[]; total: number; timestamp: string }

export type SearchResult =
  | { kind: 'no_criteria' }
  | { kind: 'not_found' }
  | { kind: 'ok'; students: Array<Record<string, unknown>>; total: number; timestamp: string }

function formatStudent(student: RosterUser, isCurseduca: boolean): FormattedStudent {
  let joinedDate = student.hotmart?.purchaseDate || student.metadata?.createdAt
  const lastActivity = getLastLearnerActivityDate(student as LearnerActivitySource)
  let status = student.combined?.status || student.hotmart?.status || 'ACTIVE'

  if (isCurseduca) {
    joinedDate = student.curseduca?.joinedDate || joinedDate
    status = student.combined?.status || student.curseduca?.memberStatus || status
  }

  return {
    _id: student._id,
    name: student.name || 'Nome não disponível',
    email: student.email,
    discordId: student.discord?.discordIds?.[0],
    status,
    estado: status === 'INACTIVE' ? 'inativo' : 'ativo',
    joinedAt: joinedDate,
    lastActivity,
    platform: isCurseduca ? 'curseduca' : 'hotmart',
  }
}

function buildSearchQuery(criteria: SearchCriteria): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  if (criteria.email) query.email = { $regex: criteria.email, $options: 'i' }
  if (criteria.name) query.name = { $regex: criteria.name, $options: 'i' }
  if (criteria.discordId) query.discordIds = criteria.discordId
  if (criteria.classId) query.classId = criteria.classId
  if (criteria.status) query.status = criteria.status
  return query
}

export class ClassRosterService {
  constructor(
    private readonly reader: ClassRosterReader,
    private readonly clock: Clock,
  ) {}

  async getStudents(classId: string, opts: RosterQuery): Promise<RosterResult> {
    if (!classId) return { kind: 'bad_request' }

    const classData = await this.reader.getClassById(classId)
    if (!classData) return { kind: 'not_found' }

    const isCurseduca = classData.source === 'curseduca_sync'
    let filter: Record<string, unknown>

    if (isCurseduca) {
      const memberIds = await this.reader.findCurseducaMemberIds(classId, opts.includeInactive)
      filter = { _id: { $in: memberIds } }
    } else {
      filter = { classId, 'inactivation.isManuallyInactivated': { $ne: true } }
      if (!opts.includeInactive) filter['combined.status'] = { $ne: 'INACTIVE' }
    }

    const sort: Record<string, 1 | -1> = { [opts.sortBy]: opts.sortOrder === 'desc' ? -1 : 1 }

    // Sequential, matching the legacy handler: page first, then the count.
    const students = await this.reader.findStudents(filter, sort, opts.limit, opts.offset)
    const total = await this.reader.countStudents(filter)

    return {
      kind: 'ok',
      className: classData.name,
      students: students.map(student => formatStudent(student, isCurseduca)),
      total,
      timestamp: this.clock.now().toISOString(),
    }
  }

  async search(criteria: SearchCriteria): Promise<SearchResult> {
    if (!criteria.email && !criteria.name && !criteria.discordId && !criteria.classId) {
      return { kind: 'no_criteria' }
    }

    const query = buildSearchQuery(criteria)

    const [students, total] = await Promise.all([
      this.reader.searchStudents(query, criteria.limit, criteria.offset),
      this.reader.countSearch(query),
    ])

    if (students.length === 0) return { kind: 'not_found' }

    const withClassNames = await Promise.all(
      students.map(async student => {
        if (student.classId) {
          const className = await this.reader.resolveClassName(student.classId)
          return { ...student, className: className || student.classId }
        }
        return student
      }),
    )

    return {
      kind: 'ok',
      students: withClassNames as unknown as Array<Record<string, unknown>>,
      total,
      timestamp: this.clock.now().toISOString(),
    }
  }
}
