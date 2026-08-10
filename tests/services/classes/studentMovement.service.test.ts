import {
  StudentMovementService,
  type MoveStudentInput,
  type StudentMovementWriter,
} from '../../../src/services/classes/studentMovement.service'

function recordingWriter() {
  const seen: Date[] = []
  const writer: StudentMovementWriter = {
    async moveStudent(_input: MoveStudentInput, movedAt: Date): Promise<unknown> {
      seen.push(movedAt)
      return { id: `history-${seen.length}` }
    },
  }
  return { writer, seen }
}

function sequentialClock(times: Date[]) {
  let index = 0
  return { now: () => times[index++] }
}

describe('StudentMovementService injected clock', () => {
  it('drives moveOne dateMoved and HTTP timestamp from one deterministic instant', async () => {
    const fixed = new Date('2026-01-02T03:04:05.000Z')
    const { writer, seen } = recordingWriter()
    const service = new StudentMovementService(writer, { now: () => fixed })

    const { timestamp } = await service.moveOne({ studentId: 's1', toClassId: 'to' })

    expect(seen).toEqual([fixed]) // the same instant the writer stamps onto dateMoved
    expect(timestamp).toBe('2026-01-02T03:04:05.000Z')
  })

  it('stamps each bulk move with its own instant and the response with a later one', async () => {
    const t1 = new Date('2026-01-02T03:04:05.000Z')
    const t2 = new Date('2026-01-02T03:04:06.000Z')
    const t3 = new Date('2026-01-02T03:04:07.000Z')
    const { writer, seen } = recordingWriter()
    const service = new StudentMovementService(writer, sequentialClock([t1, t2, t3]))

    const { timestamp } = await service.moveMany({ studentIds: ['a', 'b'], toClassId: 'to' })

    // Per-student instants (t1, t2), never a single shared batch timestamp.
    expect(seen).toEqual([t1, t2])
    // The HTTP response carries a later instant taken after the batch (t3).
    expect(timestamp).toBe('2026-01-02T03:04:07.000Z')
  })
})
