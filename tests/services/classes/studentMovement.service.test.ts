import {
  StudentMovementService,
  type MoveManyResult,
  type MoveMultipleInput,
  type MoveStudentInput,
  type StudentMovementWriter,
} from '../../../src/services/classes/studentMovement.service'

const fixed = new Date('2026-01-02T03:04:05.000Z')
const clock = { now: () => fixed }

function recordingWriter() {
  const seen: { one?: Date; many?: Date } = {}
  const writer: StudentMovementWriter = {
    async moveStudent(_input: MoveStudentInput, movedAt: Date): Promise<unknown> {
      seen.one = movedAt
      return { id: 'history-1' }
    },
    async moveMultipleStudents(_input: MoveMultipleInput, movedAt: Date): Promise<MoveManyResult> {
      seen.many = movedAt
      return { success: [], errors: [] }
    },
  }
  return { writer, seen }
}

describe('StudentMovementService injected clock', () => {
  it('drives moveOne dateMoved and HTTP timestamp from one deterministic instant', async () => {
    const { writer, seen } = recordingWriter()
    const service = new StudentMovementService(writer, clock)

    const { timestamp } = await service.moveOne({ studentId: 's1', toClassId: 'to' })

    expect(seen.one).toBe(fixed) // the same instant the writer stamps onto dateMoved
    expect(timestamp).toBe('2026-01-02T03:04:05.000Z')
  })

  it('drives moveMany from the same deterministic instant', async () => {
    const { writer, seen } = recordingWriter()
    const service = new StudentMovementService(writer, clock)

    const { timestamp } = await service.moveMany({ studentIds: ['s1'], toClassId: 'to' })

    expect(seen.many).toBe(fixed)
    expect(timestamp).toBe('2026-01-02T03:04:05.000Z')
  })
})
