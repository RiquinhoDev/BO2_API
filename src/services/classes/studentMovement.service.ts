/**
 * Student movement between classes (POST /moveStudent, /moveMultipleStudents).
 * The writer owns every Class/User/ClassHistory write, migrated verbatim from
 * the retired StudentService; the service adds the injected Clock timestamp.
 */

export interface Clock {
  now(): Date
}

export interface MoveStudentInput {
  studentId: string
  fromClassId?: string
  toClassId: string
  reason?: string
  performedBy?: string
}

export interface MoveMultipleInput {
  studentIds: string[]
  toClassId: string
  reason?: string
  performedBy?: string
}

export interface MoveSuccess {
  studentId: string
  movement: unknown
}

export interface MoveError {
  studentId: string
  error: string
}

export interface MoveManyResult {
  success: MoveSuccess[]
  errors: MoveError[]
}

export interface StudentMovementWriter {
  moveStudent(input: MoveStudentInput, movedAt: Date): Promise<unknown>
}

export class StudentMovementService {
  constructor(
    private readonly writer: StudentMovementWriter,
    private readonly clock: Clock,
  ) {}

  async moveOne(input: MoveStudentInput): Promise<{ movement: unknown; timestamp: string }> {
    // One instant drives both the persisted dateMoved and the HTTP timestamp.
    const now = this.clock.now()
    const movement = await this.writer.moveStudent(input, now)
    return { movement, timestamp: now.toISOString() }
  }

  async moveMany(input: MoveMultipleInput): Promise<{ results: MoveManyResult; timestamp: string }> {
    const { studentIds, toClassId, reason, performedBy } = input

    // Sequential, best-effort: each student gets its own instant (no shared
    // batch timestamp), errors are captured per student, and there is no
    // global rollback of the moves that already succeeded.
    const results: MoveManyResult = { success: [], errors: [] }
    for (const studentId of studentIds) {
      try {
        const movedAt = this.clock.now()
        const movement = await this.writer.moveStudent({ studentId, toClassId, reason, performedBy }, movedAt)
        results.success.push({ studentId, movement })
      } catch (error) {
        results.errors.push({ studentId, error: (error as Error).message })
      }
    }

    return { results, timestamp: this.clock.now().toISOString() }
  }
}
