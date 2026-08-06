/**
 * Class-details reads behind GET /stats, GET /:classId/details and the two
 * fetchClassData routes. The reader owns every Mongoose read (migrated from
 * ClassesService: getClassStats/getClassDetails/getDetailedClassStats/
 * fetchMultipleClassData/fetchAllClassData and the source/distribution helpers);
 * the service adds the injected Clock and the inactivation counts. All four
 * handlers are read-only.
 */

export interface Clock {
  now(): Date
}

export interface StatsFilters {
  dateFrom?: string
  dateTo?: string
  classIds?: string[]
}

export interface DetailsOptions {
  includeStudents?: boolean
  includeHistory?: boolean
}

export interface FetchOptions {
  includeStudents?: boolean
  includeStats?: boolean
}

export interface SourceBreakdown {
  hotmart_sync: number
  manual: number
  import: number
  curseduca_sync: number
}

export interface ClassStatsData {
  totalClasses: number
  totalStudents: number
  activeClasses: number
  inactiveClasses: number
  recentMovements: number
  sourceBreakdown: SourceBreakdown
  studentDistribution: unknown[]
}

export interface InactivationCounts {
  pendingLists: number
  completedLists: number
}

export type ClassRecord = Record<string, unknown>

export interface ClassDetailsReader {
  classStats(filters: StatsFilters): Promise<ClassStatsData>
  inactivationCounts(): Promise<InactivationCounts>
  classDetails(classId: string, options: DetailsOptions): Promise<ClassRecord | null>
  fetchMultiple(classIds: string[], options: FetchOptions): Promise<ClassRecord[]>
  fetchAll(options: FetchOptions): Promise<ClassRecord[]>
}

export type DetailsResult =
  | { kind: 'not_found' }
  | { kind: 'ok'; data: ClassRecord; timestamp: string }

export class ClassDetailsService {
  constructor(
    private readonly reader: ClassDetailsReader,
    private readonly clock: Clock,
  ) {}

  async stats(filters: StatsFilters): Promise<{ data: ClassStatsData & { inactivationStats: InactivationCounts }; timestamp: string }> {
    // Sequential, matching the legacy handler: class stats first, then the
    // controller's inactivation counts.
    const classStats = await this.reader.classStats(filters)
    const inactivationStats = await this.reader.inactivationCounts()
    return { data: { ...classStats, inactivationStats }, timestamp: this.clock.now().toISOString() }
  }

  async details(classId: string, options: DetailsOptions): Promise<DetailsResult> {
    const details = await this.reader.classDetails(classId, options)
    if (!details) return { kind: 'not_found' }
    return { kind: 'ok', data: details, timestamp: this.clock.now().toISOString() }
  }

  async fetch(classIds: string[] | undefined, options: FetchOptions): Promise<{ classes: ClassRecord[]; timestamp: string }> {
    const classes = classIds
      ? await this.reader.fetchMultiple(classIds, options)
      : await this.reader.fetchAll(options)
    return { classes, timestamp: this.clock.now().toISOString() }
  }
}
