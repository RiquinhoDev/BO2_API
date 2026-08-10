/**
 * Class write mutations behind POST /addOrEditClass and DELETE /:classId. The
 * writer owns every Mongoose write (migrated verbatim from ClassesService
 * addOrEditClass/getClassById/deleteClass); the service adds the injected Clock.
 *
 * upsert is the canonical write operation: the public handler and the two
 * residual inactivation consumers (createInactivationList, updateClassStatus)
 * all go through it, so ClassesService.addOrEditClass can be deleted. The delete
 * keeps both legacy student-count checks: the service's source-aware pre-check
 * and the writer's classId-based check.
 */

export interface Clock {
  now(): Date
}

export interface ClassInput {
  classId: string
  name: string
  description?: string
  isActive?: boolean
  estado?: 'ativo' | 'inativo'
  source?: string
}

export interface UpsertResult {
  class: unknown
  isNew: boolean
}

export interface ClassSummary {
  studentCount: number
  [key: string]: unknown
}

export interface ClassMutationsWriter {
  upsert(input: ClassInput): Promise<UpsertResult>
  classSummary(classId: string): Promise<ClassSummary | null>
  remove(classId: string): Promise<void>
}

export type RemoveResult =
  | { kind: 'not_found' }
  | { kind: 'has_students'; studentCount: number }
  | { kind: 'ok'; timestamp: string }

export class ClassMutationsService {
  constructor(
    private readonly writer: ClassMutationsWriter,
    private readonly clock: Clock,
  ) {}

  async upsert(input: ClassInput): Promise<UpsertResult & { timestamp: string }> {
    const result = await this.writer.upsert(input)
    return { ...result, timestamp: this.clock.now().toISOString() }
  }

  async remove(classId: string): Promise<RemoveResult> {
    // Source-aware pre-check (the legacy controller check).
    const summary = await this.writer.classSummary(classId)
    if (!summary) return { kind: 'not_found' }
    if (summary.studentCount > 0) return { kind: 'has_students', studentCount: summary.studentCount }

    // The writer's remove keeps its own classId-based student-count guard.
    await this.writer.remove(classId)
    return { kind: 'ok', timestamp: this.clock.now().toISOString() }
  }
}
