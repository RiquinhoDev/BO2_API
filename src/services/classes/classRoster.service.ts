import { getLastLearnerActivityDate, type LearnerActivitySource } from '../activity/learnerActivity'

/**
 * Class roster reads behind GET /:classId/students and /users/search. The reader
 * owns every Mongoose read; the service holds the pure filter/query building and
 * formatting. A Clock is injected so timestamps are testable.
 *
 * Hardened: search terms are escaped as literal regex and capped in length,
 * limit/offset are validated and capped, sorts carry an _id tiebreak, the Discord
 * search uses the canonical schema path, and class-name resolution is batched.
 * The polymorphic single/multiple search envelope and the status-alone-400 gate
 * are preserved.
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

export type SearchRosterStudent = RosterUser & {
  className?: string
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
  resolveClassNames(classIds: string[]): Promise<Map<string, string>>
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
  | { kind: 'ok'; students: SearchRosterStudent[]; total: number; timestamp: string }

const MAX_TERM_LENGTH = 256
const MAX_RESULTS = 200
const ROSTER_SORT_ALLOWLIST = new Set(['name', 'email', 'joinedAt', 'createdAt', 'status'])

/** Escapes regex metacharacters so a search term matches literally. */
export function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Clamps a limit to [1, MAX_RESULTS], falling back for invalid input. */
export function sanitizeLimit(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return Math.min(fallback, MAX_RESULTS)
  return Math.min(Math.floor(value), MAX_RESULTS)
}

/** Clamps an offset to a non-negative integer, falling back for invalid input. */
export function sanitizeOffset(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}

/** Restricts sortBy to a known set of public keys, defaulting to name. */
export function sanitizeSortBy(value: string): string {
  return ROSTER_SORT_ALLOWLIST.has(value) ? value : 'name'
}

/**
 * Maps a public sort key to its real Mongo path. joinedAt is source-dependent,
 * so it is resolved only after the class source is known. Unknown keys fall back
 * to name (defence in depth; the controller already sanitizes).
 */
export function resolveSortPath(sortBy: string, isCurseduca: boolean): string {
  switch (sortBy) {
    case 'email':
      return 'email'
    case 'createdAt':
      return 'metadata.createdAt'
    case 'status':
      return 'combined.status'
    case 'joinedAt':
      return isCurseduca ? 'curseduca.joinedDate' : 'hotmart.purchaseDate'
    case 'name':
    default:
      return 'name'
  }
}

function literalRegex(term: string): { $regex: string; $options: string } {
  return { $regex: escapeRegex(term.slice(0, MAX_TERM_LENGTH)), $options: 'i' }
}

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
  if (criteria.email) query.email = literalRegex(criteria.email)
  if (criteria.name) query.name = literalRegex(criteria.name)
  if (criteria.discordId) query['discord.discordIds'] = criteria.discordId
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

    // Map the public sort key to its real Mongo path, then add an _id tiebreak
    // so the order is total and pagination stays stable across pages.
    const sortPath = resolveSortPath(opts.sortBy, isCurseduca)
    const sort: Record<string, 1 | -1> = { [sortPath]: opts.sortOrder === 'desc' ? -1 : 1, _id: 1 }

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

    // Batch class-name resolution: one read for every distinct classId.
    const classIds = [...new Set(students.map(student => student.classId).filter((id): id is string => Boolean(id)))]
    const nameByClassId = await this.reader.resolveClassNames(classIds)

    const withClassNames = students.map(student =>
      student.classId
        ? { ...student, className: nameByClassId.get(student.classId) || student.classId }
        : student,
    )

    return {
      kind: 'ok',
      students: withClassNames,
      total,
      timestamp: this.clock.now().toISOString(),
    }
  }
}
