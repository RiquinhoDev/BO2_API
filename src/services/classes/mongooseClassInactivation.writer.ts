// Mongoose writer for the classInactivation vertical. Owns every Class/User/
// UserProduct/UserHistory/StudentClassHistory read and write behind the four
// inactivation handlers, migrated verbatim from the controller. Discord
// delegation and the canonical class upsert are injected ports, not here.
import type { FilterQuery, UpdateQuery } from 'mongoose'
import { Class } from '../../models/Class'
import StudentClassHistory from '../../models/StudentClassHistory'
import { User, UserProduct } from '../../models'
import type { IUser } from '../../models/user'
import UserHistory, { type IUserHistory } from '../../models/UserHistory'
import logger from '../../utils/logger'
import { buildClassUserStatusUpdate } from './classUserStatus'
import type {
  ClassInactivationWriter,
  ClassStatusOutcome,
  ClassSummaryForUpsert,
  InactivationListView,
  InactivationOptions,
  InactivationResult,
  ListFilters,
} from './classInactivation.service'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class MongooseClassInactivationWriter implements ClassInactivationWriter {
  async inactivateClassStudents(
    classIds: string[],
    options: InactivationOptions,
    now: Date,
  ): Promise<{ results: InactivationResult[]; totalInactivated: number }> {
    const { userId, description, platforms } = options
    const results: InactivationResult[] = []
    let totalInactivated = 0

    for (const classId of classIds) {
      const classData = await Class.findOne({ classId }).lean()
      if (!classData) {
        results.push({ classId, success: false, error: 'Turma não encontrada' })
        continue
      }

      const students: Array<Pick<IUser, '_id' | 'email' | 'name'>> =
        classData.source === 'curseduca_sync' && classData.curseducaUuid
          ? await User.find({
            'curseduca.groupCurseducaUuid': classData.curseducaUuid,
            'combined.status': { $ne: 'INACTIVE' },
          }).lean()
          : await User.find({
            classId,
            'combined.status': { $ne: 'INACTIVE' },
          }).lean()

      for (const student of students) {
        try {
          const updates: UpdateQuery<IUser> = {
            'combined.status': 'INACTIVE',
            'inactivation.isManuallyInactivated': true,
            'inactivation.inactivatedAt': now,
            'inactivation.inactivatedBy': userId || 'Sistema',
            'inactivation.reason': description || `Inativação por turma: ${classData.name}`,
            'inactivation.platforms': platforms,
            'inactivation.classId': classId,
            'metadata.updatedAt': now,
          }

          if (platforms.includes('hotmart') || platforms.includes('all')) {
            updates['hotmart.status'] = 'INACTIVE'
          }
          if (platforms.includes('curseduca') || platforms.includes('all')) {
            updates['curseduca.memberStatus'] = 'INACTIVE'
          }
          if (platforms.includes('discord') || platforms.includes('all')) {
            updates['discord.isActive'] = false
          }

          await User.findByIdAndUpdate(student._id, { $set: updates })

          await UserProduct.updateMany({ userId: student._id }, { $set: { status: 'INACTIVE' } })

          try {
            await UserHistory.createInactivationHistory(
              student._id,
              student.email || 'Email desconhecido',
              platforms,
              description || `Inativação por turma: ${classData.name}`,
              userId || 'Sistema',
            )
          } catch (historyError: unknown) {
            logger.warn('Erro ao registrar histórico de inativação', { email: student.email, error: errorMessage(historyError) })
          }

          totalInactivated++
          results.push({
            studentId: student._id,
            email: student.email,
            name: student.name,
            status: 'success',
            classId,
            className: classData.name,
          })
        } catch (studentError: unknown) {
          results.push({
            studentId: student._id,
            email: student.email,
            name: student.name,
            status: 'error',
            error: errorMessage(studentError),
            classId,
          })
        }
      }
    }

    return { results, totalInactivated }
  }

  async findClassForUpsert(classId: string): Promise<ClassSummaryForUpsert | null> {
    const existingClass = await Class.findOne({ classId }).lean()
    if (!existingClass) return null
    return { name: existingClass.name, description: existingClass.description, source: existingClass.source }
  }

  async listInactivations(filters: ListFilters): Promise<{ lists: InactivationListView[]; total: number }> {
    const { status, limit, offset } = filters

    const query: FilterQuery<IUserHistory> = { changeType: 'INACTIVATION' }
    if (status) {
      query['metadata.status'] = status
    }

    const total = await UserHistory.countDocuments(query)

    const inactivations = await UserHistory.find(query)
      .sort({ changeDate: -1 })
      .limit(limit)
      .skip(offset)
      .lean()

    const lists: InactivationListView[] = []
    for (const inact of inactivations) {
      const user = await User.findById(inact.userId).select('classId').lean()
      if (user) {
        const classData = await Class.findOne({ classId: user.classId }).lean()
        lists.push({
          _id: inact._id,
          name: `Inativação ${new Date(inact.changeDate).toLocaleDateString('pt-PT')}`,
          classNames: classData ? [classData.name] : [],
          createdAt: inact.changeDate,
          status: 'COMPLETED',
          studentCount: 1,
          executedDate: inact.changeDate,
          performedBy: inact.changedBy,
          platforms: inact.metadata?.platforms || [],
        })
      }
    }

    return { lists, total }
  }

  async revertInactivationRecord(
    id: string,
    options: { reason?: string; userId?: string },
  ): Promise<'not_found' | 'ok'> {
    const { reason, userId } = options

    const inactivation = await UserHistory.findById(id)
    if (!inactivation) return 'not_found'

    const updates: UpdateQuery<IUser> = {
      'combined.status': 'ACTIVE',
    }

    const platforms = inactivation.metadata?.platforms || []
    if (platforms.includes('hotmart') || platforms.includes('all')) {
      updates['hotmart.status'] = 'ACTIVE'
    }
    if (platforms.includes('curseduca') || platforms.includes('all')) {
      updates['curseduca.memberStatus'] = 'ACTIVE'
    }
    if (platforms.includes('discord') || platforms.includes('all')) {
      updates['discord.isActive'] = true
    }

    await User.findByIdAndUpdate(inactivation.userId, { $set: updates })

    await UserProduct.updateMany({ userId: inactivation.userId }, { $set: { status: 'ACTIVE' } })

    await UserHistory.create({
      userId: inactivation.userId,
      userEmail: inactivation.userEmail,
      changeType: 'STATUS_CHANGE',
      previousValue: { status: 'INACTIVE' },
      newValue: { status: 'ACTIVE' },
      source: 'MANUAL',
      changedBy: userId || 'Sistema',
      reason: reason || 'Reversão de inativação',
    })

    return 'ok'
  }

  async applyClassStatus(
    classId: string,
    isActive: boolean,
    options: { reason?: string; userId?: string },
    now: Date,
  ): Promise<ClassStatusOutcome> {
    const { reason, userId } = options

    const existingClass = await Class.findOne({ classId }).lean()
    if (!existingClass) return 'not_found'

    let affectedStudents = 0
    if (!isActive) {
      const activeStudents = await User.find({
        classId,
        'combined.status': { $ne: 'INACTIVE' },
      })

      if (activeStudents.length > 0) {
        const updateResult = await User.updateMany(
          { classId, 'combined.status': { $ne: 'INACTIVE' } },
          { $set: buildClassUserStatusUpdate(false) },
        )

        affectedStudents = updateResult.modifiedCount

        const studentIds = activeStudents.map((s) => s._id)
        await UserProduct.updateMany(
          { userId: { $in: studentIds }, platform: 'hotmart' },
          { $set: { status: 'INACTIVE' } },
        )

        const historyEntries = activeStudents.map((student) => ({
          studentId: student._id,
          classId,
          className: existingClass.name || classId,
          previousClassId: classId,
          previousClassName: existingClass.name || classId,
          dateMoved: now,
          reason: reason || 'Turma desativada',
          movedBy: userId || 'system',
        }))

        if (historyEntries.length > 0) {
          await StudentClassHistory.insertMany(historyEntries)
        }
      }
    }

    let reactivatedStudents = 0
    if (isActive && !existingClass.isActive) {
      const studentsToReactivate = await User.find({
        classId,
        'combined.status': 'INACTIVE',
        'inactivation.isManuallyInactivated': true,
        'inactivation.classId': classId,
      })

      if (studentsToReactivate.length > 0) {
        const updateResult = await User.updateMany(
          {
            classId,
            'combined.status': 'INACTIVE',
            'inactivation.isManuallyInactivated': true,
            'inactivation.classId': classId,
          },
          {
            $set: {
              ...buildClassUserStatusUpdate(true),
              'inactivation.isManuallyInactivated': false,
              'inactivation.reactivatedAt': now,
              'inactivation.reactivatedBy': userId || 'system',
              'inactivation.reactivationReason': 'manual',
            },
          },
        )

        reactivatedStudents = updateResult.modifiedCount

        const reactivateIds = studentsToReactivate.map((s) => s._id)
        await UserProduct.updateMany(
          { userId: { $in: reactivateIds }, platform: 'hotmart', status: 'INACTIVE' },
          { $set: { status: 'ACTIVE' } },
        )

        const historyEntries = studentsToReactivate.map((student) => ({
          studentId: student._id,
          classId,
          className: existingClass.name || classId,
          previousClassId: classId,
          previousClassName: existingClass.name || classId,
          dateMoved: now,
          reason: reason || 'Turma reativada',
          movedBy: userId || 'system',
        }))

        if (historyEntries.length > 0) {
          await StudentClassHistory.insertMany(historyEntries)
        }
      }
    }

    return {
      existingClass: { name: existingClass.name, description: existingClass.description, source: existingClass.source },
      affectedStudents,
      reactivatedStudents,
    }
  }
}
