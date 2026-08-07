import { Class, ClassHistory, InactivationList } from '../../models/Class'
import { User } from '../../models'
import type {
  ClassDetailsReader,
  ClassRecord,
  ClassStatsData,
  DetailsOptions,
  FetchOptions,
  InactivationCounts,
  SourceBreakdown,
  StatsFilters,
} from './classDetails.service'

type Query = Record<string, unknown>

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Owns every Mongoose read for class details, migrated verbatim from
 * ClassesService (getClassStats/getClassDetails/getDetailedClassStats/
 * fetchMultipleClassData/fetchAllClassData plus the source/distribution
 * helpers). The class-with-studentCount lookup is owned here directly; the
 * classMutations vertical keeps its own independent copy for the delete path.
 */
export class MongooseClassDetailsReader implements ClassDetailsReader {
  async classStats(filters: StatsFilters): Promise<ClassStatsData> {
    const { dateFrom, dateTo, classIds } = filters

    const classQuery: Query = {}
    if (classIds && classIds.length > 0) classQuery.classId = { $in: classIds }

    const dateQuery: Query = {}
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {}
      if (dateFrom) range.$gte = new Date(dateFrom)
      if (dateTo) range.$lte = new Date(dateTo)
      dateQuery.dateMoved = range
    }

    const [
      totalClasses,
      activeClasses,
      inactiveClasses,
      totalStudents,
      recentMovements,
      sourceBreakdown,
      studentDistribution,
    ] = await Promise.all([
      Class.countDocuments(classQuery),
      Class.countDocuments({ ...classQuery, isActive: true, estado: 'ativo' }),
      Class.countDocuments({ ...classQuery, $or: [{ isActive: false }, { estado: 'inativo' }] }),
      User.countDocuments(classIds ? { classId: { $in: classIds } } : {}),
      ClassHistory.countDocuments({ ...dateQuery, ...(classIds ? { classId: { $in: classIds } } : {}) }),
      this.sourceBreakdown(classQuery),
      this.studentDistribution(classIds),
    ])

    return { totalClasses, totalStudents, activeClasses, inactiveClasses, recentMovements, sourceBreakdown, studentDistribution }
  }

  async inactivationCounts(): Promise<InactivationCounts> {
    const [pendingLists, completedLists] = await Promise.all([
      InactivationList.countDocuments({ status: { $in: ['PENDING', 'EXECUTING'] } }),
      InactivationList.countDocuments({ status: 'COMPLETED' }),
    ])
    return { pendingLists, completedLists }
  }

  async classDetails(classId: string, options: DetailsOptions): Promise<ClassRecord | null> {
    const cls = await this.classByIdWithStudentCount(classId)
    if (!cls) return null

    const details: ClassRecord = { ...cls }
    details.stats = await this.detailedStats(classId)

    if (options.includeStudents) {
      details.students = await User.find(
        { classId },
        { name: 1, email: 1, status: 1, discordIds: 1, enrollmentDate: 1, lastActivity: 1 },
      ).sort({ name: 1 }).lean()
    }

    if (options.includeHistory) {
      details.recentHistory = await ClassHistory.find({ classId }).sort({ dateMoved: -1 }).limit(50).lean()
    }

    return details
  }

  async fetchMultiple(classIds: string[], options: FetchOptions): Promise<ClassRecord[]> {
    const classes = await Class.find({ classId: { $in: classIds } }).lean() as unknown as ClassRecord[]
    return Promise.all(classes.map(cls => this.enrich(cls, options)))
  }

  async fetchAll(options: FetchOptions): Promise<ClassRecord[]> {
    const classes = await Class.find({ isActive: true }).lean() as unknown as ClassRecord[]
    return Promise.all(classes.map(cls => this.enrich(cls, options)))
  }

  private async enrich(cls: ClassRecord, options: FetchOptions): Promise<ClassRecord> {
    const result: ClassRecord = { ...cls }
    if (options.includeStats) result.stats = await this.detailedStats(cls.classId as string)
    if (options.includeStudents) result.students = await User.find({ classId: cls.classId }).lean()
    return result
  }

  private async classByIdWithStudentCount(classId: string): Promise<ClassRecord | null> {
    const cls = await Class.findOne({ classId }).lean() as unknown as ClassRecord | null
    if (!cls) return null
    const studentCount = cls.source === 'curseduca_sync' && cls.curseducaUuid
      ? await User.countDocuments({ 'curseduca.groupCurseducaUuid': cls.curseducaUuid, 'combined.status': 'ACTIVE' })
      : await User.countDocuments({ classId: cls.classId, status: 'ACTIVE' })
    return { ...cls, studentCount }
  }

  private async detailedStats(classId: string): Promise<ClassRecord> {
    const cls = await Class.findOne({ classId }).lean() as unknown as ClassRecord | null

    let counts: [number, number, number, number]
    if (cls && cls.source === 'curseduca_sync' && cls.curseducaUuid) {
      const uuid = cls.curseducaUuid
      counts = await Promise.all([
        User.countDocuments({ 'curseduca.groupCurseducaUuid': uuid }),
        User.countDocuments({ 'curseduca.groupCurseducaUuid': uuid, 'combined.status': 'ACTIVE' }),
        User.countDocuments({ 'curseduca.groupCurseducaUuid': uuid, 'combined.status': { $ne: 'ACTIVE' } }),
        User.countDocuments({ 'curseduca.groupCurseducaUuid': uuid, 'curseduca.joinedDate': { $gte: new Date(Date.now() - WEEK_MS) } }),
      ])
    } else {
      counts = await Promise.all([
        User.countDocuments({ classId }),
        User.countDocuments({ classId, status: 'ACTIVE' }),
        User.countDocuments({ classId, status: { $ne: 'ACTIVE' } }),
        User.countDocuments({ classId, enrollmentDate: { $gte: new Date(Date.now() - WEEK_MS) } }),
      ])
    }

    const lastMovement = await ClassHistory.findOne({ classId }, {}, { sort: { dateMoved: -1 } })
    const [totalStudents, activeStudents, inactiveStudents, recentEnrollments] = counts

    return {
      totalStudents,
      activeStudents,
      inactiveStudents,
      recentEnrollments,
      lastMovement: (lastMovement as { dateMoved?: Date } | null)?.dateMoved,
    }
  }

  private async sourceBreakdown(classQuery: Query): Promise<SourceBreakdown> {
    const result: SourceBreakdown = { hotmart_sync: 0, manual: 0, import: 0, curseduca_sync: 0 }
    try {
      const breakdown = await Class.aggregate<{ _id: string; count: number }>([
        { $match: classQuery },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ])
      for (const item of breakdown) {
        if (item._id in result) result[item._id as keyof SourceBreakdown] = item.count
      }
    } catch {
      return { hotmart_sync: 0, manual: 0, import: 0, curseduca_sync: 0 }
    }
    return result
  }

  private async studentDistribution(classIds?: string[]): Promise<unknown[]> {
    const matchQuery: Query = {}
    if (classIds && classIds.length > 0) matchQuery.classId = { $in: classIds }
    try {
      return await User.aggregate([
        { $match: matchQuery },
        { $group: { _id: '$classId', studentCount: { $sum: 1 } } },
        { $lookup: { from: 'classes', localField: '_id', foreignField: 'classId', as: 'classInfo' } },
        { $unwind: { path: '$classInfo', preserveNullAndEmptyArrays: true } },
        { $project: { classId: '$_id', className: { $ifNull: ['$classInfo.name', 'Turma Desconhecida'] }, studentCount: 1 } },
        { $sort: { studentCount: -1 } },
      ])
    } catch {
      return []
    }
  }
}
