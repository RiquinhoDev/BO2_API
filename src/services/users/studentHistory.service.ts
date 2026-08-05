import type {
  ClassHistoryRow,
  HistoryItem,
  HistoryLogger,
  StudentHistoryResult,
  StudentHistorySourcesReader,
  StudentHistoryStudentReader,
  SyncHistoryRow,
  UserHistoryRow,
} from './studentHistory.contract'

export const DEFAULT_HISTORY_LIMIT = 50

function toTime(date: Date | undefined): number {
  return date ? new Date(date).getTime() : 0
}

export class StudentHistoryService {
  constructor(
    private readonly students: StudentHistoryStudentReader,
    private readonly sources: StudentHistorySourcesReader,
    private readonly logger: HistoryLogger,
  ) {}

  /**
   * A failing source is logged and treated as empty; the response still
   * succeeds with whatever the other sources returned. This mirrors the
   * per-query try/catch of the legacy handler, including the case where an id
   * that is not a valid ObjectId makes the user-history read throw.
   */
  private async readOrDegrade<T>(label: string, read: () => Promise<T[]>): Promise<T[]> {
    try {
      return await read()
    } catch (error) {
      this.logger.warn(`student history source unavailable: ${label}`, {
        detail: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  async get(id: string, limit = DEFAULT_HISTORY_LIMIT): Promise<StudentHistoryResult | null> {
    const student = await this.students.findForHistory(id)
    if (!student) return null

    const userHistory = await this.readOrDegrade<UserHistoryRow>(
      'user', () => this.sources.readUserHistory(id, student.email, limit),
    )
    const classHistory = await this.readOrDegrade<ClassHistoryRow>(
      'class', () => this.sources.readClassHistory(student.id),
    )
    const syncHistory = await this.readOrDegrade<SyncHistoryRow>(
      'sync', () => this.sources.readSyncHistory(student.email),
    )

    const history: HistoryItem[] = [
      ...userHistory.map(row => ({
        ...row,
        type: 'user_change' as const,
        date: row.changeDate,
        source: row.source || 'MANUAL',
      })),
      ...classHistory.map(row => ({
        ...row,
        type: 'class_change' as const,
        date: row.dateMoved,
        source: 'MANUAL',
      })),
      ...syncHistory.map(row => ({
        ...row,
        type: 'sync' as const,
        date: row.startedAt,
        source: row.type,
      })),
    ]
      .sort((a, b) => toTime(b.date) - toTime(a.date))
      .slice(0, limit)

    return {
      student: {
        id: student.id,
        email: student.email,
        name: student.name,
        platforms: {
          discord: student.hasDiscord,
          hotmart: student.hasHotmart,
          curseduca: student.hasCurseduca,
        },
      },
      history,
      stats: {
        totalItems: history.length,
        // Counted from the raw sources, not the truncated merge.
        userChanges: userHistory.length,
        classChanges: classHistory.length,
        syncEvents: syncHistory.length,
        lastActivity: history.length > 0 ? history[0].date ?? null : null,
      },
      userHistory,
      classHistory,
      syncHistory,
      total: history.length,
    }
  }
}
