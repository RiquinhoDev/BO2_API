// Mongoose writer for the studentMovement vertical. Every Class/User/ClassHistory
// write behind POST /moveStudent and /moveMultipleStudents lives here, migrated
// verbatim from the retired StudentService (the single moveStudent write plus
// the private updateClassStudentCount refresh). The bulk loop lives in the
// service so each student is stamped with its own instant.
import { Class, ClassHistory } from '../../models/Class'
import User from '../../models/user'
import type {
  MoveStudentInput,
  StudentMovementWriter,
} from './studentMovement.service'

export class MongooseStudentMovementWriter implements StudentMovementWriter {
  async moveStudent(input: MoveStudentInput, movedAt: Date): Promise<unknown> {
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
      dateMoved: movedAt,
    })

    await historyEntry.save()

    if (previousClassId) {
      await this.updateClassStudentCount(previousClassId)
    }
    await this.updateClassStudentCount(toClassId)

    return historyEntry
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
