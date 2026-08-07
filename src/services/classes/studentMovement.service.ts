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
  moveStudent(input: MoveStudentInput): Promise<unknown>
  moveMultipleStudents(input: MoveMultipleInput): Promise<MoveManyResult>
}

export class StudentMovementService {
  constructor(
    private readonly writer: StudentMovementWriter,
    private readonly clock: Clock,
  ) {}

  async moveOne(input: MoveStudentInput): Promise<{ movement: unknown; timestamp: string }> {
    const movement = await this.writer.moveStudent(input)
    return { movement, timestamp: this.clock.now().toISOString() }
  }

  async moveMany(input: MoveMultipleInput): Promise<{ results: MoveManyResult; timestamp: string }> {
    const results = await this.writer.moveMultipleStudents(input)
    return { results, timestamp: this.clock.now().toISOString() }
  }
}
