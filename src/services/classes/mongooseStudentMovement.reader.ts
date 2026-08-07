// Mongoose writer for the studentMovement vertical. Every Class/User/ClassHistory
// write behind POST /moveStudent and /moveMultipleStudents lives here, migrated
// verbatim from the retired StudentService (moveStudent/moveMultipleStudents +
// the private updateClassStudentCount count refresh).
import { Class, ClassHistory } from '../../models/Class'
import User from '../../models/user'
import type {
  MoveManyResult,
  MoveMultipleInput,
  MoveStudentInput,
  StudentMovementWriter,
} from './studentMovement.service'

export class MongooseStudentMovementReader implements StudentMovementWriter {
  async moveStudent(input: MoveStudentInput): Promise<unknown> {
    const { studentId, toClassId, reason, performedBy } = input

    const student = await User.findById(studentId)
    if (!student) {
      throw new Error('Estudante não encontrado')
    }

    const toClass = await Class.findOne({ classId: toClassId })
    if (!toClass) {
      throw new Error('Turma de destino não encontrada')
    }

    const previousClassId = student.classId

    let fromClassName: string | undefined
    if (previousClassId) {
      const fromClass = await Class.findOne({ classId: previousClassId })
      fromClassName = fromClass?.name || previousClassId
    }

    student.classId = toClassId
    student.className = toClass.name
    await student.save()

    const historyEntry = new ClassHistory({
      studentId: student._id.toString(),
      studentEmail: student.email,
      studentName: student.name,
      classId: toClassId,
      className: toClass.name,
      fromClassId: previousClassId,
      fromClassName,
      action: 'MOVE',
      reason: reason || 'Movimentação via API',
      performedBy,
      dateMoved: new Date(),
    })

    await historyEntry.save()

    if (previousClassId) {
      await this.updateClassStudentCount(previousClassId)
    }
    await this.updateClassStudentCount(toClassId)

    return historyEntry
  }

  async moveMultipleStudents(input: MoveMultipleInput): Promise<MoveManyResult> {
    const { studentIds, toClassId, reason, performedBy } = input

    const results: MoveManyResult = { success: [], errors: [] }

    for (const studentId of studentIds) {
      try {
        const movement = await this.moveStudent({ studentId, toClassId, reason, performedBy })
        results.success.push({ studentId, movement })
      } catch (error) {
        results.errors.push({ studentId, error: (error as Error).message })
      }
    }

    return results
  }

  private async updateClassStudentCount(classId: string): Promise<number> {
    const cls = await Class.findOne({ classId }).lean()

    const count = cls && cls.source === 'curseduca_sync' && cls.curseducaUuid
      ? await User.countDocuments({
        'curseduca.groupCurseducaUuid': cls.curseducaUuid,
        'combined.status': 'ACTIVE',
      })
      : await User.countDocuments({ classId, status: 'ACTIVE' })

    await Class.updateOne({ classId }, { studentCount: count })

    return count
  }
}
