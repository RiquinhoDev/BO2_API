/**
 * Class history reads behind GET /history, /:classId/complete-history and the
 * two per-student history routes. The reader owns every Mongoose read; the
 * service holds the pure query building, entry mapping and the merge/sort. A
 * Clock is injected so timestamps are testable without the wall clock.
 *
 * Two behaviours are preserved verbatim as known legacy debt: the per-source
 * error swallowing in the complete history, and its double pagination
 * (limit/offset applied in each source query and again on the merged array).
 * Fixing either is separate hardening work.
 */

export interface Clock {
  now(): Date
}

export type ClassHistorySource = 'movements' | 'changes' | 'syncs'

/**
 * Observability port for the complete-history partial success: when a source
 * degrades, the failure is reported here (wired to the redacted logger) instead
 * of vanishing into a silent catch. It never reaches the HTTP response.
 */
export interface ClassHistoryDegradationReporter {
  report(source: ClassHistorySource, error: unknown): void
}

export interface ClassHistoryEntry {
  type: 'STUDENT_MOVEMENT' | 'USER_CHANGE' | 'SYNC'
  date: Date
  [key: string]: unknown
}

export interface ClassSummary {
  name?: string
  source?: string
  curseducaUuid?: string
}

export interface StudentRef {
  _id: unknown
  email?: string
}

export interface UserDoc {
  _id: unknown
  name?: string
  email?: string
}

/** A lean StudentClassHistory document returned to the client untransformed. */
export type HistoryRecord = { [key: string]: unknown }

export interface MovementDoc {
  dateMoved?: Date
  studentId?: { name?: string; email?: string }
  previousClassId?: string
  previousClassName?: string
  className?: string
  reason?: string
  movedBy?: string
}

export interface ChangeDoc {
  changeDate?: Date
  changeType?: string
  userEmail?: string
  field?: string
  previousValue?: unknown
  newValue?: unknown
  platform?: string
  source?: string
  reason?: string
  changedBy?: string
}

export interface SyncDoc {
  startedAt?: Date
  type?: string
  status?: string
  stats?: unknown
  metadata?: unknown
}

type HistoryQuery = Record<string, unknown>

export interface HistoryFilters {
  classId?: string
  studentId?: string
  dateFrom?: string
  dateTo?: string
  limit: number
  offset: number
}

export interface ClassHistoryReader {
  getClassById(classId: string): Promise<ClassSummary | null>
  countHistory(query: HistoryQuery): Promise<number>
  findHistory(query: HistoryQuery, limit: number, offset: number): Promise<HistoryRecord[]>
  listMovements(classId: string, limit: number, offset: number): Promise<MovementDoc[]>
  listStudents(classData: ClassSummary, classId: string): Promise<StudentRef[]>
  listUserChanges(studentIds: unknown[], limit: number, offset: number): Promise<ChangeDoc[]>
  listSyncs(classId: string): Promise<SyncDoc[]>
  findUserByDiscord(discordId: string): Promise<UserDoc | null>
  findUserByEmail(email: string): Promise<UserDoc | null>
  countByStudent(studentId: unknown): Promise<number>
  findByStudent(studentId: unknown, limit: number, offset: number): Promise<HistoryRecord[]>
}

export type StudentHistoryResult =
  | { kind: 'not_found' }
  | { kind: 'ok'; student: UserDoc; history: HistoryRecord[]; total: number; timestamp: string }

export type CompleteHistoryResult =
  | { kind: 'bad_request' }
  | { kind: 'not_found' }
  | { kind: 'ok'; className?: string; history: ClassHistoryEntry[]; total: number; limit: number; offset: number; timestamp: string }

function buildHistoryQuery(filters: HistoryFilters): HistoryQuery {
  const query: HistoryQuery = {}
  if (filters.classId) query.$or = [{ classId: filters.classId }, { previousClassId: filters.classId }]
  if (filters.studentId) query.studentId = filters.studentId
  if (filters.dateFrom || filters.dateTo) {
    const range: Record<string, Date> = {}
    if (filters.dateFrom) range.$gte = new Date(filters.dateFrom)
    if (filters.dateTo) range.$lte = new Date(filters.dateTo)
    query.dateMoved = range
  }
  return query
}

const movementEntry = (mov: MovementDoc): ClassHistoryEntry => ({
  type: 'STUDENT_MOVEMENT',
  date: mov.dateMoved as Date,
  student: { name: mov.studentId?.name || 'Aluno desconhecido', email: mov.studentId?.email },
  action: mov.previousClassId ? 'MOVED' : 'ENROLLED',
  from: mov.previousClassName,
  to: mov.className,
  reason: mov.reason,
  performedBy: mov.movedBy,
})

const changeEntry = (change: ChangeDoc): ClassHistoryEntry => ({
  type: 'USER_CHANGE',
  date: change.changeDate as Date,
  changeType: change.changeType,
  userEmail: change.userEmail,
  field: change.field,
  previousValue: change.previousValue,
  newValue: change.newValue,
  platform: change.platform,
  source: change.source,
  reason: change.reason,
  performedBy: change.changedBy,
})

const syncEntry = (sync: SyncDoc): ClassHistoryEntry => ({
  type: 'SYNC',
  date: sync.startedAt as Date,
  syncType: sync.type,
  status: sync.status,
  stats: sync.stats,
  metadata: sync.metadata,
})

export class ClassHistoryService {
  constructor(
    private readonly reader: ClassHistoryReader,
    private readonly clock: Clock,
    private readonly degradation: ClassHistoryDegradationReporter,
  ) {}

  async listHistory(filters: HistoryFilters): Promise<{ history: HistoryRecord[]; total: number; filters: HistoryFilters; timestamp: string }> {
    const query = buildHistoryQuery(filters)
    const total = await this.reader.countHistory(query)
    const history = await this.reader.findHistory(query, filters.limit, filters.offset)
    return { history, total, filters, timestamp: this.clock.now().toISOString() }
  }

  private async studentHistory(user: UserDoc | null, limit: number, offset: number): Promise<StudentHistoryResult> {
    if (!user) return { kind: 'not_found' }
    const total = await this.reader.countByStudent(user._id)
    const history = await this.reader.findByStudent(user._id, limit, offset)
    return {
      kind: 'ok',
      student: { _id: user._id, name: user.name, email: user.email },
      history,
      total,
      timestamp: this.clock.now().toISOString(),
    }
  }

  async byDiscord(discordId: string, limit: number, offset: number): Promise<StudentHistoryResult> {
    return this.studentHistory(await this.reader.findUserByDiscord(discordId), limit, offset)
  }

  async byEmail(email: string, limit: number, offset: number): Promise<StudentHistoryResult> {
    return this.studentHistory(await this.reader.findUserByEmail(email.toLowerCase()), limit, offset)
  }

  async completeHistory(
    classId: string,
    opts: { limit: number; offset: number; type?: string },
  ): Promise<CompleteHistoryResult> {
    if (!classId) return { kind: 'bad_request' }

    const classData = await this.reader.getClassById(classId)
    if (!classData) return { kind: 'not_found' }

    const { limit, offset, type } = opts
    const history: ClassHistoryEntry[] = []

    if (!type || type === 'movements') {
      try {
        const movements = await this.reader.listMovements(classId, limit, offset)
        for (const mov of movements) history.push(movementEntry(mov))
      } catch (error) { this.degradation.report('movements', error) }
    }

    if (!type || type === 'changes') {
      try {
        const students = await this.reader.listStudents(classData, classId)
        const studentIds = students.map(student => student._id)
        if (studentIds.length > 0) {
          const changes = await this.reader.listUserChanges(studentIds, limit, offset)
          for (const change of changes) history.push(changeEntry(change))
        }
      } catch (error) { this.degradation.report('changes', error) }
    }

    if (!type || type === 'syncs') {
      try {
        const syncs = await this.reader.listSyncs(classId)
        for (const sync of syncs) history.push(syncEntry(sync))
      } catch (error) { this.degradation.report('syncs', error) }
    }

    history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    // Legacy double pagination: each source query already applied limit/offset;
    // the merged array is sliced again with the same window.
    const paginated = history.slice(offset, offset + limit)

    return {
      kind: 'ok',
      className: classData.name,
      history: paginated,
      total: history.length,
      limit,
      offset,
      timestamp: this.clock.now().toISOString(),
    }
  }
}
