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
import UserHistory, { type IUserHistory } from '../../models/UserHistory'
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

  // As listas reais vivem em InactivationList. A versão anterior sintetizava-as
  // a partir do UserHistory, uma entrada por aluno, e o Front via "listas" que
  // nunca existiram.
  async listInactivations(filters: ListFilters): Promise<{ lists: InactivationListView[]; total: number }> {
    const { status, limit, offset } = filters

    // O Front filtra por 'REVERTED'; na BD isso é 'REVERSED'.
    const paraBd: Record<string, string[]> = {
      REVERTED: ['REVERSED'],
      PENDING: ['PENDING', 'EXECUTING'],
      COMPLETED: ['COMPLETED'],
      FAILED: ['FAILED', 'CANCELLED'],
    }
    const query: FilterQuery<IInactivationList> = {}
    if (status) {
      query.status = { $in: paraBd[String(status)] ?? [String(status)] }
    }

    const [total, docs] = await Promise.all([
      InactivationList.countDocuments(query),
      // Conta-se os alunos no servidor e deixa-se o array de fora: a listagem só
      // precisa do número, e o array leva os emails de toda a gente.
      InactivationList.aggregate<InactivationListAggregate>([
        { $match: query },
        { $sort: { createdAt: -1 } },
        { $skip: offset },
        { $limit: limit },
        { $addFields: { studentCount: { $size: { $ifNull: ['$students', []] } } } },
        { $project: { students: 0 } },
      ]),
    ])

    // Nomes das turmas: a lista já os costuma trazer, mas quando só tem os ids
    // vamos buscá-los — numa só query para todas as listas da página.
    const idsEmFalta = [...new Set(
      docs.flatMap((doc) => (doc.classNames?.length ? [] : (doc.classIds ?? []))),
    )]
    const nomePorId = new Map<string, string>()
    if (idsEmFalta.length) {
      const turmas = await Class.find({ classId: { $in: idsEmFalta } }).select('classId name').lean()
      for (const turma of turmas) nomePorId.set(String(turma.classId), turma.name)
    }

    const paraFront: Record<string, string> = {
      REVERSED: 'REVERTED',
      EXECUTING: 'PENDING',
      CANCELLED: 'FAILED',
    }

    const lists: InactivationListView[] = docs.map((doc) => ({
      _id: doc._id,
      name: doc.name,
      classNames: doc.classNames?.length
        ? doc.classNames
        : (doc.classIds ?? []).map((id) => nomePorId.get(String(id)) ?? id),
      createdAt: doc.createdAt,
      status: paraFront[doc.status] ?? doc.status,
      studentCount: doc.studentCount ?? doc.execution?.totalProcessed ?? 0,
      executedDate: doc.execution?.completedAt ?? doc.execution?.startedAt,
      revertedAt: doc.reversal?.reversedAt,
      performedBy: doc.execution?.executedBy,
      results: doc.execution
        ? {
            success: doc.execution.successCount ?? 0,
            errors: doc.execution.errorCount ?? 0,
            details: doc.execution.errors ?? [],
          }
        : undefined,
    }))

    return { lists, total }
  }

  async listInactivationStudents(
    filters: ListStudentsFilters,
  ): Promise<'not_found' | { list: InactivationListSummary; students: InactivationStudentView[]; total: number }> {
    const { id, limit, offset, search } = filters
    if (!mongoose.Types.ObjectId.isValid(id)) return 'not_found'

    const lista = await InactivationList.findById(id).select('name status classIds').lean()
    if (!lista) return 'not_found'

    const termo = (search ?? '').trim()
    const filtroBusca = termo
      ? [{ $match: { $or: [
          { email: { $regex: termo, $options: 'i' } },
          { nome: { $regex: termo, $options: 'i' } },
          { turma: { $regex: termo, $options: 'i' } },
        ] } }]
      : []

    const [resultado] = await InactivationList.aggregate<{
      total: { n: number }[]
      linhas: InactivationStudentView[]
    }>([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      { $unwind: '$students' },
      { $lookup: { from: 'users', localField: 'students.studentId', foreignField: '_id', as: 'utilizador' } },
      { $lookup: { from: 'classes', localField: 'students.classId', foreignField: 'classId', as: 'turmaDoc' } },
      { $project: {
        _id: 0,
        studentId: '$students.studentId',
        email: { $ifNull: ['$students.email', { $first: '$utilizador.email' }] },
        nome: { $first: '$utilizador.name' },
        classId: '$students.classId',
        turma: { $ifNull: [{ $first: '$turmaDoc.name' }, '$students.classId'] },
        estadoAnterior: '$students.previousState',
        processado: { $ifNull: ['$students.processed', null] },
        erro: { $ifNull: ['$students.error', null] },
        // estado actual do aluno, para se ver se a inactivação pegou
        estadoActual: { $first: '$utilizador.combined.status' },
      } },
      ...filtroBusca,
      { $facet: {
        total: [{ $count: 'n' }],
        linhas: [{ $sort: { nome: 1, email: 1 } }, { $skip: offset }, { $limit: limit }],
      } },
    ])

    return {
      list: { _id: lista._id, name: lista.name, status: lista.status },
      students: resultado?.linhas ?? [],
      total: resultado?.total?.[0]?.n ?? 0,
    }
  }

  async deleteInactivationRecord(id: string): Promise<'not_found' | DeletedListView> {
    if (!mongoose.Types.ObjectId.isValid(id)) return 'not_found'

    const lista = await InactivationList.findById(id).lean()
    if (!lista) return 'not_found'

    const abrangidos = lista.students?.length ?? 0
    await InactivationList.findByIdAndDelete(id)

    logger.info(`[InactivationList] Registo apagado: "${lista.name}" (${abrangidos} alunos abrangidos, estado ${lista.status}). Nenhum aluno foi alterado.`)

    return { _id: lista._id, name: lista.name, status: lista.status, studentsAbrangidos: abrangidos }
  }

  async revertInactivationRecord(
    id: string,
    options: { reason?: string; userId?: string },
  ): Promise<'not_found' | 'already_reversed' | RevertOutcome> {
    const { reason, userId } = options
    const PLATAFORMAS_OGI = ['hotmart', 'discord']

    // Repõe uma pessoa ao estado anterior à inactivação.
    const reactivar = async (studentId: unknown, email?: string): Promise<void> => {
      await User.findByIdAndUpdate(studentId, {
        $set: {
          'combined.status': 'ACTIVE',
          'hotmart.status': 'ACTIVE',
          'discord.isActive': true,
        },
      })
      await UserProduct.updateMany(
        { userId: studentId, platform: { $in: PLATAFORMAS_OGI } },
        { $set: { status: 'ACTIVE' } },
      )
      await UserHistory.create({
        userId: studentId,
        userEmail: email,
        changeType: 'STATUS_CHANGE',
        previousValue: { status: 'INACTIVE' },
        newValue: { status: 'ACTIVE' },
        source: 'MANUAL',
        changedBy: userId || 'Sistema',
        reason: reason || 'Reversão de inativação',
      })
    }

    const lista = mongoose.Types.ObjectId.isValid(id) ? await InactivationList.findById(id) : null

    if (lista) {
      if (lista.status === 'REVERSED') return 'already_reversed'

      const alunos = lista.students ?? []
      // quem já estava inactivo antes não é para reactivar
      const aRepor = alunos.filter((aluno) => aluno.previousState === 'ativo')
      const erros: { studentId: unknown; error: string }[] = []
      let revertidos = 0

      for (const aluno of aRepor) {
        try {
          await reactivar(aluno.studentId, aluno.email)
          revertidos += 1
        } catch (error: unknown) {
          erros.push({ studentId: aluno.studentId, error: errorMessage(error) })
        }
      }

      lista.status = 'REVERSED'
      lista.reversal = {
        reversedAt: new Date(),
        reversedBy: userId || 'Sistema',
        reason: reason || 'Reversão manual pelo Backoffice',
      }
      await lista.save()

      // Não há chamada ao Discord aqui: o endpoint legacy `/add-roles` nunca
      // existiu neste repo e falhava em silêncio. Os cargos são reconciliados
      // de noite pelo DiscordRolesSync.
      return {
        listName: lista.name,
        totalNaLista: alunos.length,
        reactivados: revertidos,
        jaEstavamInactivos: alunos.length - aRepor.length,
        erros,
      }
    }

    // Compatibilidade: id de um registo individual do UserHistory.
    const inactivation = await UserHistory.findById(id)
    if (!inactivation) return 'not_found'

    await reactivar(inactivation.userId, inactivation.userEmail)

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
