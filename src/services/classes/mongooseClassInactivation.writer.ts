// Mongoose writer for the classInactivation vertical. Owns every Class/User/
// UserProduct/UserHistory/StudentClassHistory read and write behind the four
// inactivation handlers, migrated verbatim from the controller. Discord
// delegation and the canonical class upsert are injected ports, not here.
import type { FilterQuery, UpdateQuery } from 'mongoose'
import mongoose from 'mongoose'
import { Class } from '../../models/Class'
import InactivationList, { type IInactivationList } from '../../models/InactivationList'
import StudentClassHistory from '../../models/StudentClassHistory'
import { User, UserProduct } from '../../models'
import type { IUser } from '../../models/user'
import UserHistory from '../../models/UserHistory'
import logger from '../../utils/logger'
import { buildClassUserStatusUpdate } from './classUserStatus'
import type {
  ClassInactivationWriter,
  DeletedListView,
  InactivationListSummary,
  InactivationStudentView,
  ListStudentsFilters,
  RevertOutcome,
  ClassStatusOutcome,
  ClassSummaryForUpsert,
  InactivationListView,
  InactivationOptions,
  InactivationResult,
  ListFilters,
} from './classInactivation.service'

interface InactivationListAggregate {
  _id: unknown
  name: string
  status: string
  classIds?: string[]
  classNames?: string[]
  createdAt: Date
  studentCount?: number
  execution?: IInactivationList['execution']
  reversal?: IInactivationList['reversal']
}

const MAX_REVERSAL_STUDENTS = 5_000

function productPlatforms(platforms: string[]): string[] {
  return platforms.includes('all') ? ['hotmart', 'curseduca', 'discord'] : platforms
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

          await UserProduct.updateMany(
            { userId: student._id, platform: { $in: productPlatforms(platforms) }, status: { $ne: 'INACTIVE' } },
            { $set: { status: 'INACTIVE' } },
          )

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

  async createInactivationRecord(input: {
    name: string
    description?: string
    classIds: string[]
    results: InactivationResult[]
    executedBy?: string
    createdAt: Date
  }): Promise<{ _id: string }> {
    const studentResults = input.results.filter((result) => result.studentId && result.email)
    const successCount = studentResults.filter((result) => result.status === 'success').length
    const errorResults = studentResults.filter((result) => result.status === 'error')
    const record = await InactivationList.create({
      name: input.name,
      description: input.description,
      status: errorResults.length === 0 ? 'COMPLETED' : 'FAILED',
      classIds: input.classIds,
      classNames: [...new Set(input.results.flatMap((result) => result.className ? [result.className] : []))],
      students: studentResults.map((result) => ({
        studentId: result.studentId,
        email: result.email,
        discordIds: [],
        classId: result.classId,
        previousState: 'ativo',
        processed: result.status === 'success',
        error: result.error,
      })),
      execution: {
        startedAt: input.createdAt,
        completedAt: input.createdAt,
        executedBy: input.executedBy ?? 'Sistema',
        totalProcessed: studentResults.length,
        successCount,
        errorCount: errorResults.length,
        errors: errorResults.map((result) => ({
          studentId: result.studentId,
          error: result.error ?? 'Erro desconhecido',
          timestamp: input.createdAt,
        })),
      },
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    })
    return { _id: String(record._id) }
  }

  async listInactivations(filters: ListFilters): Promise<{ lists: InactivationListView[]; total: number }> {
    const { status, limit, offset } = filters
    const query: FilterQuery<IInactivationList> = {}
    if (status) query.status = String(status) as IInactivationList['status']

    const [total, docs] = await Promise.all([
      InactivationList.countDocuments(query),
      InactivationList.aggregate<InactivationListAggregate>([
        { $match: query },
        { $sort: { createdAt: -1, _id: -1 } },
        { $skip: offset },
        { $limit: limit },
        { $addFields: { studentCount: { $size: { $ifNull: ['$students', []] } } } },
        { $project: { students: 0 } },
      ]),
    ])

    const missingIds = [...new Set(docs.flatMap((doc) => doc.classNames?.length ? [] : (doc.classIds ?? [])))]
    const nameById = new Map<string, string>()
    if (missingIds.length) {
      const classes = await Class.find({ classId: { $in: missingIds } }).select('classId name').lean()
      for (const cls of classes) nameById.set(String(cls.classId), cls.name)
    }

    return {
      total,
      lists: docs.map((doc) => ({
        _id: doc._id,
        name: doc.name,
        classNames: doc.classNames?.length ? doc.classNames : (doc.classIds ?? []).map((classId) => nameById.get(String(classId)) ?? classId),
        createdAt: doc.createdAt,
        status: doc.status,
        studentCount: doc.studentCount ?? doc.execution?.totalProcessed ?? 0,
        executedDate: doc.execution?.completedAt ?? doc.execution?.startedAt,
        revertedAt: doc.reversal?.reversedAt,
        performedBy: doc.execution?.executedBy,
        results: doc.execution ? { success: doc.execution.successCount ?? 0, errors: doc.execution.errorCount ?? 0, details: doc.execution.errors ?? [] } : undefined,
      })),
    }
  }

  async listInactivationStudents(filters: ListStudentsFilters): Promise<'not_found' | { list: InactivationListSummary; students: InactivationStudentView[]; total: number }> {
    const { id, limit, offset, search } = filters
    if (!mongoose.Types.ObjectId.isValid(id)) return 'not_found'
    const list = await InactivationList.findById(id).select('name status').lean()
    if (!list) return 'not_found'

    const term = (search ?? '').trim()
    const searchStages = term ? [{ $match: { $or: [
      { email: { $regex: escapeRegex(term), $options: 'i' } },
      { nome: { $regex: escapeRegex(term), $options: 'i' } },
      { turma: { $regex: escapeRegex(term), $options: 'i' } },
    ] } }] : []
    const [result] = await InactivationList.aggregate<{ total: { n: number }[]; rows: InactivationStudentView[] }>([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      { $unwind: '$students' },
      { $lookup: { from: 'users', localField: 'students.studentId', foreignField: '_id', as: 'user' } },
      { $lookup: { from: 'classes', localField: 'students.classId', foreignField: 'classId', as: 'class' } },
      { $project: {
        _id: 0,
        studentId: '$students.studentId',
        email: { $ifNull: ['$students.email', { $first: '$user.email' }] },
        nome: { $first: '$user.name' },
        classId: '$students.classId',
        turma: { $ifNull: [{ $first: '$class.name' }, '$students.classId'] },
        estadoAnterior: '$students.previousState',
        processado: { $ifNull: ['$students.processed', null] },
        erro: { $ifNull: ['$students.error', null] },
        estadoActual: { $first: '$user.combined.status' },
      } },
      ...searchStages,
      { $facet: {
        total: [{ $count: 'n' }],
        rows: [{ $sort: { nome: 1, email: 1, studentId: 1 } }, { $skip: offset }, { $limit: limit }],
      } },
    ])
    return { list: { _id: list._id, name: list.name, status: list.status }, students: result?.rows ?? [], total: result?.total?.[0]?.n ?? 0 }
  }

  async deleteInactivationRecord(id: string): Promise<'not_found' | DeletedListView> {
    if (!mongoose.Types.ObjectId.isValid(id)) return 'not_found'
    const list = await InactivationList.findByIdAndDelete(id).lean()
    if (!list) return 'not_found'
    const count = list.students?.length ?? 0
    logger.info(`[InactivationList] Registo apagado: "${list.name}" (${count} alunos abrangidos, estado ${list.status}). Nenhum aluno foi alterado.`)
    return { _id: list._id, name: list.name, status: list.status, studentsAbrangidos: count }
  }

  async revertInactivationRecord(id: string, options: { reason?: string; userId?: string }): Promise<'not_found' | 'already_reversed' | 'too_large' | RevertOutcome> {
    const reactivate = async (studentId: unknown, email?: string): Promise<void> => {
      await User.findByIdAndUpdate(studentId, { $set: { 'combined.status': 'ACTIVE', 'hotmart.status': 'ACTIVE', 'discord.isActive': true } })
      await UserProduct.updateMany({ userId: studentId, platform: { $in: ['hotmart', 'discord'] }, status: 'INACTIVE' }, { $set: { status: 'ACTIVE' } })
      await UserHistory.create({
        userId: studentId,
        userEmail: email,
        changeType: 'STATUS_CHANGE',
        previousValue: { status: 'INACTIVE' },
        newValue: { status: 'ACTIVE' },
        source: 'MANUAL',
        changedBy: options.userId || 'Sistema',
        reason: options.reason || 'Reversão de inativação',
      })
    }

    const list = mongoose.Types.ObjectId.isValid(id) ? await InactivationList.findById(id) : null
    if (list) {
      if (list.status === 'REVERSED') return 'already_reversed'
      const students = list.students ?? []
      if (students.length > MAX_REVERSAL_STUDENTS) return 'too_large'
      const toReactivate = students.filter((student) => student.previousState === 'ativo')
      const errors: { studentId: unknown; error: string }[] = []
      let reactivated = 0
      for (const student of toReactivate) {
        try {
          await reactivate(student.studentId, student.email)
          reactivated += 1
        } catch (error: unknown) {
          errors.push({ studentId: student.studentId, error: errorMessage(error) })
        }
      }
      list.status = 'REVERSED'
      list.reversal = { reversedAt: new Date(), reversedBy: options.userId || 'Sistema', reason: options.reason || 'Reversão manual pelo Backoffice' }
      await list.save()
      return { listName: list.name, totalNaLista: students.length, reactivados: reactivated, jaEstavamInactivos: students.length - toReactivate.length, erros: errors }
    }

    const history = mongoose.Types.ObjectId.isValid(id) ? await UserHistory.findById(id) : null
    if (!history) return 'not_found'
    if (history.previousValue?.status === 'INACTIVE') {
      return { totalNaLista: 1, reactivados: 0, jaEstavamInactivos: 1, erros: [] }
    }
    await reactivate(history.userId, history.userEmail)
    return { totalNaLista: 1, reactivados: 1, jaEstavamInactivos: 0, erros: [] }
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
