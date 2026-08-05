/**
 * Ports for the student history read. Each source is a separate port because
 * the legacy endpoint degrades one failing source to an empty list rather than
 * failing the whole response; that rule lives in the service, so the readers
 * are free to throw normally.
 */

export interface StudentHistoryIdentity {
  id: unknown
  email?: string
  name?: string
  hasDiscord: boolean
  hasHotmart: boolean
  hasCurseduca: boolean
}

export interface StudentHistoryStudentReader {
  findForHistory(id: string): Promise<StudentHistoryIdentity | null>
}

export interface UserHistoryRow {
  changeDate?: Date
  source?: string
  [key: string]: unknown
}

export interface ClassHistoryRow {
  dateMoved?: Date
  [key: string]: unknown
}

export interface SyncHistoryRow {
  startedAt?: Date
  type?: string
  [key: string]: unknown
}

export interface StudentHistorySourcesReader {
  readUserHistory(id: string, email: string | undefined, limit: number): Promise<UserHistoryRow[]>
  readClassHistory(studentId: unknown): Promise<ClassHistoryRow[]>
  readSyncHistory(email: string | undefined): Promise<SyncHistoryRow[]>
}

export type HistoryItemType = 'user_change' | 'class_change' | 'sync'

export interface HistoryItem {
  type: HistoryItemType
  date?: Date
  source?: string
  [key: string]: unknown
}

export interface StudentHistoryResult {
  student: {
    id: unknown
    email?: string
    name?: string
    platforms: {
      discord: boolean
      hotmart: boolean
      curseduca: boolean
    }
  }
  history: HistoryItem[]
  stats: {
    totalItems: number
    userChanges: number
    classChanges: number
    syncEvents: number
    lastActivity: Date | null
  }
  userHistory: UserHistoryRow[]
  classHistory: ClassHistoryRow[]
  syncHistory: SyncHistoryRow[]
  total: number
}

/** Minimal logging port so the service never reaches for `console`. */
export interface HistoryLogger {
  warn(message: string, meta?: object): void
}
